import { DEFAULT_CONFIG } from "./config.js";
import { matchesMail, mailSummary, normalizeEnvelope, normalizeSourceDefinition, SOURCE_STATES, subscriptionActive, validateMatch } from "./model.js";
import { MailboxScheduler } from "./scheduler.js";
import { normalizeSourceConfig, normalizeSourceSettings } from "./source-settings.js";
import { clone, compareCoreTime, decodeCursor, dedupKey, encodeCursor, errorMessage, id, isoTime, jsonSize, normalizeSearchText, nowIso } from "./util.js";

class PublishCapacityError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class SourceSettingsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SourceSettingsError";
    this.code = code;
  }
}

function sourceKeyOf(sourceId, instance) {
  return `${sourceId}:${instance}`;
}

function ownDelivery(state, sessionId, deliveryId) {
  const delivery = state.deliveries[deliveryId];
  if (!delivery || delivery.sessionId !== sessionId) throw new Error("Delivery does not belong to the current Session");
  return delivery;
}

function isInFlight(state, deliveryId) {
  return Object.values(state.batches).some((batch) => batch.state === "injecting" && batch.deliveryIds.includes(deliveryId));
}

function removeOldestSettledMail(state) {
  const candidates = Object.values(state.mails).filter((mail) => {
    const related = Object.values(state.deliveries).filter((delivery) => delivery.mailId === mail.mailId);
    return related.every((delivery) => !["queued", "deferred"].includes(delivery.state));
  }).sort((a, b) => compareCoreTime(a.receivedAt, b.receivedAt, a.mailSeq, b.mailSeq));
  const mail = candidates[0];
  if (!mail) return false;
  const removedDeliveryIds = new Set(Object.values(state.deliveries)
    .filter((delivery) => delivery.mailId === mail.mailId)
    .map((delivery) => delivery.deliveryId));
  for (const deliveryId of removedDeliveryIds) delete state.deliveries[deliveryId];
  for (const [batchId, batch] of Object.entries(state.batches)) {
    if (batch.deliveryIds.every((deliveryId) => removedDeliveryIds.has(deliveryId))) delete state.batches[batchId];
  }
  delete state.mails[mail.mailId];
  return true;
}

function removeOldestDedupTombstone(state) {
  const oldest = Object.entries(state.dedup)
    .filter(([, entry]) => !state.mails[entry.mailId])
    .sort((a, b) => Date.parse(a[1].receivedAt) - Date.parse(b[1].receivedAt))[0];
  if (!oldest) return false;
  delete state.dedup[oldest[0]];
  return true;
}

function ensureCapacity(state, additionalDeliveries, config) {
  for (;;) {
    const dedupFull = Object.keys(state.dedup).length >= config.maxDedup;
    if (dedupFull && removeOldestDedupTombstone(state)) continue;
    const mailFull = Object.keys(state.mails).length >= config.maxMails;
    const deliveryFull = Object.keys(state.deliveries).length + additionalDeliveries > config.maxDeliveries;
    if ((dedupFull || mailFull || deliveryFull) && removeOldestSettledMail(state)) continue;
    break;
  }
  if (Object.keys(state.mails).length >= config.maxMails) {
    throw new PublishCapacityError("MAIL_CAPACITY", "Mailbox Mail capacity is full with pending work");
  }
  if (Object.keys(state.dedup).length >= config.maxDedup) {
    throw new PublishCapacityError("DEDUP_CAPACITY", "Mailbox dedup capacity is full");
  }
  if (Object.keys(state.deliveries).length + additionalDeliveries > config.maxDeliveries) {
    throw new PublishCapacityError("DELIVERY_CAPACITY", "Mailbox Delivery capacity is full");
  }
}

function pageAfterCursor(rows, cursor) {
  if (!cursor) return rows;
  const decoded = decodeCursor(cursor);
  if (typeof decoded.createdAt !== "string" || typeof decoded.id !== "string") throw new TypeError("cursor is invalid");
  const exact = rows.findIndex((row) => row.createdAt === decoded.createdAt && row.id === decoded.id);
  if (exact >= 0) return rows.slice(exact + 1);
  return rows.filter((row) => Date.parse(row.createdAt) < Date.parse(decoded.createdAt) ||
    (row.createdAt === decoded.createdAt && row.id < decoded.id));
}

export class AgentMailbox {
  constructor({ repository, config = DEFAULT_CONFIG, now = Date.now, logger = () => {}, timer, flush }) {
    this.repository = repository;
    this.config = config;
    this.now = now;
    this.logger = logger;
    this.sources = new Map();
    this.closed = false;
    this.archivedSessionIds = new Set();
    this.scheduler = new MailboxScheduler({ repository, config, now, logger, timer, flush });
  }

  registerSource(input) {
    if (this.closed) throw new Error("agentMailbox is closed");
    if (!input || typeof input !== "object") throw new TypeError("Source definition must be an object");
    const { settings: rawSettings, defaultConfig: rawDefaultConfig, validateConfig, validateSubscription, actions, ...definitionInput } = input;
    if (validateConfig !== undefined && typeof validateConfig !== "function") {
      throw new TypeError("Source validateConfig must be a function");
    }
    if (validateSubscription !== undefined && typeof validateSubscription !== "function") {
      throw new TypeError("Source validateSubscription must be a function");
    }
    const definition = normalizeSourceDefinition(definitionInput);
    const settings = normalizeSourceSettings(rawSettings);
    const validator = validateConfig || ((value) => value);
    const defaultConfig = normalizeSourceConfig(rawDefaultConfig ?? {}, validator, "defaultConfig");
    const key = dedupKey(definition.sourceId, definition.instance, "source");
    if (this.sources.has(key)) {
      throw new Error(`Mailbox source is already registered: ${definition.sourceId} + ${definition.instance}`);
    }
    const sourceKey = sourceKeyOf(definition.sourceId, definition.instance);
    let config = defaultConfig;
    let revision = 0;
    let updatedAt = null;
    let configError = null;
    const stored = this.repository.read((state) => state.sourceSettings[sourceKey]);
    if (stored) {
      try {
        config = normalizeSourceConfig(stored.config, validator);
        revision = stored.revision;
        updatedAt = stored.updatedAt;
      } catch (error) {
        configError = errorMessage(error);
      }
    }
    const actionHandlers = new Map();
    if (actions !== undefined) {
      if (!actions || typeof actions !== "object" || Array.isArray(actions)) throw new TypeError("Source actions must be an object");
      for (const [action, handler] of Object.entries(actions)) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(action)) throw new TypeError(`Invalid Source action name: ${action}`);
        if (typeof handler !== "function") throw new TypeError(`Source action ${action} must be a function`);
        if (actionHandlers.size >= 32) throw new TypeError("A Source may register at most 32 actions");
        actionHandlers.set(action, handler);
      }
    }
    if (settings) {
      for (const group of settings.groups) {
        for (const field of group.fields) {
          if (field.suggestionsAction && !actionHandlers.has(field.suggestionsAction)) {
            throw new TypeError(`Settings field '${field.key}' references unknown Source action '${field.suggestionsAction}'`);
          }
        }
      }
      if (settings.auth && !actionHandlers.has(settings.auth.action)) {
        throw new TypeError(`Settings auth references unknown Source action '${settings.auth.action}'`);
      }
    }
    const handle = {
      key,
      sourceKey,
      definition,
      settings,
      defaultConfig,
      validateConfig: validator,
      validateSubscription: validateSubscription || null,
      config,
      configError,
      revision,
      updatedAt,
      actionHandlers,
      configListeners: new Set(),
      disposed: false,
      status: {
        state: configError ? "error" : "disconnected",
        detail: configError ? `stored source settings are invalid: ${configError}` : "registered",
        deliveryReady: false,
        updatedAt: nowIso(this.now),
      },
      publish: (envelope) => this.publish(handle, envelope),
      setStatus: (status) => this.setSourceStatus(handle, status),
      dispose: () => this.disposeSource(handle),
    };
    this.sources.set(key, handle);
    return Object.freeze({
      publish: handle.publish,
      setStatus: handle.setStatus,
      dispose: handle.dispose,
      getConfig: () => clone(handle.config),
      onConfigChange: (listener) => this.onSourceConfigChange(handle, listener),
    });
  }

  onSourceConfigChange(handle, listener) {
    if (!this.sourceActive(handle)) throw new Error("Mailbox source is disposed");
    if (typeof listener !== "function") throw new TypeError("Config listener must be a function");
    handle.configListeners.add(listener);
    return () => {
      handle.configListeners.delete(listener);
    };
  }

  sourceAdminSnapshot() {
    const sources = [...this.sources.values()]
      .filter((handle) => this.sourceActive(handle) && handle.settings !== null)
      .map((handle) => ({
        sourceKey: handle.sourceKey,
        sourceId: handle.definition.sourceId,
        instance: handle.definition.instance,
        displayName: handle.definition.displayName,
        status: clone(handle.status),
        settings: clone(handle.settings),
        config: clone(handle.config),
        revision: handle.revision,
        updatedAt: handle.updatedAt,
        configError: handle.configError,
        actions: [...handle.actionHandlers.keys()].sort(),
      }));
    const overview = this.repository.read((state) => {
      const deliveryStates = {};
      for (const delivery of Object.values(state.deliveries)) {
        deliveryStates[delivery.state] = (deliveryStates[delivery.state] || 0) + 1;
      }
      const lastMail = Object.values(state.mails).sort((left, right) => compareCoreTime(right.receivedAt, left.receivedAt, right.mailSeq, left.mailSeq))[0];
      return {
        mails: Object.keys(state.mails).length,
        subscriptions: Object.keys(state.subscriptions).length,
        deliveries: Object.keys(state.deliveries).length,
        deliveryStates,
        lastReceivedAt: lastMail?.receivedAt ?? null,
        sourceSettings: Object.keys(state.sourceSettings).length,
      };
    });
    return { sources, overview };
  }

  findSourceByKey(sourceKey) {
    for (const handle of this.sources.values()) {
      if (handle.sourceKey === sourceKey && this.sourceActive(handle)) return handle;
    }
    throw new SourceSettingsError("SOURCE_NOT_FOUND", `Mailbox source is not registered: ${sourceKey}`);
  }

  async updateSourceConfig(sourceKey, config, expectedRevision) {
    const handle = this.findSourceByKey(sourceKey);
    if (!handle.settings) throw new SourceSettingsError("SETTINGS_UNSUPPORTED", `Source ${sourceKey} does not expose editable settings`);
    if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
      throw new TypeError("expectedRevision must be a non-negative integer");
    }
    const normalized = normalizeSourceConfig(config, handle.validateConfig);
    const updatedAt = nowIso(this.now);
    let saved;
    try {
      saved = await this.repository.transact((state) => {
        const current = state.sourceSettings[sourceKey];
        const revision = current?.revision ?? 0;
        if (expectedRevision !== undefined && expectedRevision !== revision) {
          throw new SourceSettingsError("SETTINGS_REVISION_CONFLICT", `Source settings changed (expected revision ${expectedRevision}, current ${revision})`);
        }
        const entry = {
          sourceKey,
          sourceId: handle.definition.sourceId,
          instance: handle.definition.instance,
          config: clone(normalized),
          revision: revision + 1,
          updatedAt,
        };
        state.sourceSettings[sourceKey] = entry;
        return { value: clone(entry), commit: true };
      });
    } catch (error) {
      if (error instanceof SourceSettingsError) throw error;
      throw new SourceSettingsError("SETTINGS_STORAGE_FAILED", `Could not persist source settings: ${errorMessage(error)}`);
    }
    handle.config = saved.config;
    handle.configError = null;
    handle.revision = saved.revision;
    handle.updatedAt = saved.updatedAt;
    const applyErrors = [];
    for (const listener of [...handle.configListeners]) {
      try {
        await listener(clone(saved.config), { sourceKey, revision: saved.revision, updatedAt: saved.updatedAt });
      } catch (error) {
        applyErrors.push(errorMessage(error));
        this.logger("warn", `agent-mailbox: source ${sourceKey} failed to apply settings: ${errorMessage(error)}`);
      }
    }
    if (applyErrors.length) {
      try {
        this.setSourceStatus(handle, { state: "error", detail: `settings saved but apply failed: ${applyErrors.join("; ")}` });
      } catch {
        // The source may have disposed while applying.
      }
    }
    return {
      source: this.sourceAdminSnapshot().sources.find((entry) => entry.sourceKey === sourceKey),
      applyError: applyErrors.length ? applyErrors.join("; ") : null,
    };
  }

  async invokeSourceAction(sourceKey, action, input = {}) {
    const handle = this.findSourceByKey(sourceKey);
    if (typeof action !== "string" || !handle.actionHandlers.has(action)) {
      throw new SourceSettingsError("SOURCE_ACTION_NOT_FOUND", `Source has no action: ${String(action)}`);
    }
    let timer;
    try {
      const result = await Promise.race([
        handle.actionHandlers.get(action)(clone(input)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new SourceSettingsError("SOURCE_ACTION_TIMEOUT", "Source action timed out after 60s")), 60000);
        }),
      ]);
      const safe = clone(result);
      if (jsonSize(safe) > 262144) throw new SourceSettingsError("SOURCE_ACTION_TOO_LARGE", "Source action result exceeds 256 KiB");
      return safe;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  sourceActive(handle) {
    const key = dedupKey(handle.definition.sourceId, handle.definition.instance, "source");
    return !this.closed && !handle.disposed && this.sources.get(key) === handle;
  }

  disposeSource(handle) {
    if (handle.disposed) return;
    handle.disposed = true;
    const key = dedupKey(handle.definition.sourceId, handle.definition.instance, "source");
    if (this.sources.get(key) === handle) this.sources.delete(key);
  }

  setSourceStatus(handle, input) {
    if (!this.sourceActive(handle)) throw new Error("Mailbox source is disposed");
    if (!input || typeof input !== "object" || !SOURCE_STATES.includes(input.state)) {
      throw new TypeError(`Source status state must be one of ${SOURCE_STATES.join(", ")}`);
    }
    const deliveryReady = typeof input.deliveryReady === "boolean"
      ? input.deliveryReady
      : input.state === "connected" || (input.state === "degraded" && handle.status.deliveryReady === true);
    handle.status = {
      state: input.state,
      detail: typeof input.detail === "string" ? input.detail.slice(0, 1000) : "",
      deliveryReady,
      updatedAt: nowIso(this.now),
    };
    return clone(handle.status);
  }

  /**
   * Agent-facing source directory. Transport diagnostics stay in
   * sourceAdminSnapshot (the human Settings surface): exposing reconnect
   * reasons here makes the model mistake a deferred source for an unusable
   * capability and fall back to ad-hoc platform CLIs.
   */
  listSources() {
    return {
      sources: [...this.sources.values()].filter((handle) => this.sourceActive(handle)).map((handle) => ({
        sourceId: handle.definition.sourceId,
        instance: handle.definition.instance,
        displayName: handle.definition.displayName,
        kinds: clone(handle.definition.kinds),
        filterFields: clone(handle.definition.filterFields),
        capabilities: clone(handle.definition.capabilities),
        deliveryReady: handle.status.deliveryReady === true,
      })),
    };
  }

  async publish(handle, envelope) {
    let normalized;
    try {
      if (!this.sourceActive(handle)) return { status: "rejected", code: "SOURCE_DISPOSED", message: "Mailbox source is disposed" };
      normalized = normalizeEnvelope(envelope, handle.definition, this.config);
    } catch (error) {
      return { status: "rejected", code: "INVALID_ENVELOPE", message: errorMessage(error) };
    }
    const receivedAt = nowIso(this.now);
    try {
      const outcome = await this.repository.transact((state) => {
        if (!this.sourceActive(handle)) return {
          value: { result: { status: "rejected", code: "SOURCE_DISPOSED", message: "Mailbox source is disposed" }, affected: [] },
          commit: false,
        };
        const { sourceId, instance: sourceInstance } = handle.definition;
        const key = dedupKey(sourceId, sourceInstance, normalized.eventId);
        const previous = state.dedup[key];
        if (previous) {
          const deliveryCount = state.mails[previous.mailId]
            ? Object.values(state.deliveries).filter((delivery) => delivery.mailId === previous.mailId).length
            : previous.deliveryCount;
          return { value: { result: { status: "duplicate", mailId: previous.mailId, deliveryCount }, affected: [] }, commit: false };
        }
        const matchedBySession = new Map();
        for (const subscription of Object.values(state.subscriptions)) {
          if (!subscriptionActive(subscription, this.now()) || !matchesMail(subscription.match, {
            ...normalized,
            sourceId,
            sourceInstance,
          }, this.now())) continue;
          const matched = matchedBySession.get(subscription.sessionId) || [];
          matched.push(subscription);
          matchedBySession.set(subscription.sessionId, matched);
        }
        for (const sessionId of [...matchedBySession.keys()]) {
          if (this.archivedSessionIds.has(sessionId)) matchedBySession.delete(sessionId);
        }
        for (const [sessionId] of matchedBySession) {
          const pending = Object.values(state.deliveries).filter((delivery) => delivery.sessionId === sessionId &&
            ["queued", "deferred"].includes(delivery.state)).length;
          if (pending >= this.config.maxPendingPerSession) {
            throw new PublishCapacityError("SESSION_BACKPRESSURE", `Session ${sessionId} has reached its pending Delivery limit`);
          }
        }
        ensureCapacity(state, matchedBySession.size, this.config);
        const mailId = id("mail");
        const mailSeq = state.nextMailSeq++;
        const mail = {
          mailId,
          mailSeq,
          ...normalized,
          sourceId,
          sourceInstance,
          receivedAt,
        };
        state.mails[mailId] = mail;
        state.dedup[key] = { mailId, deliveryCount: matchedBySession.size, receivedAt };
        const affected = [];
        for (const [sessionId, subscriptions] of matchedBySession) {
          const deliveryId = id("dlv");
          const deliverySeq = state.nextDeliverySeq++;
          state.deliveries[deliveryId] = {
            deliveryId,
            deliverySeq,
            mailId,
            sessionId,
            matchedSubscriptionIds: subscriptions.map((subscription) => subscription.subscriptionId).sort(),
            state: "queued",
            deferUntil: null,
            createdAt: receivedAt,
            deliveredAt: null,
            updatedAt: receivedAt,
            cancelledAt: null,
            deadLetterAt: null,
            injectedBatchIds: [],
            injectionCount: 0,
            attempts: 0,
            injectionHistory: [],
            lastError: null,
          };
          for (const subscription of subscriptions) {
            const current = state.subscriptions[subscription.subscriptionId];
            current.matchCount += 1;
            current.lastMatchedAt = receivedAt;
          }
          affected.push(sessionId);
        }
        return { value: { result: { status: "accepted", mailId, deliveryCount: affected.length }, affected } };
      });
      if (outcome.result.status === "accepted") {
        for (const sessionId of outcome.affected) this.scheduler.notify(sessionId);
      }
      return outcome.result;
    } catch (error) {
      if (error instanceof PublishCapacityError || error?.code?.endsWith("_CAPACITY") || error?.code === "SESSION_BACKPRESSURE") {
        return { status: "retryable", code: error.code, retryAfterMs: this.config.retryAfterMs, message: errorMessage(error) };
      }
      return { status: "retryable", code: "STORAGE_UNAVAILABLE", retryAfterMs: this.config.retryAfterMs, message: errorMessage(error) };
    }
  }

  sourceValidatorsFor(match) {
    if (!match.sourceId) return [];
    return [...this.sources.values()].filter((handle) =>
      this.sourceActive(handle) &&
      handle.validateSubscription &&
      handle.definition.sourceId === match.sourceId &&
      (match.sourceInstance === undefined || handle.definition.instance === match.sourceInstance));
  }

  subscriptionScopeError(match) {
    for (const handle of this.sourceValidatorsFor(match)) {
      try {
        const result = handle.validateSubscription(clone(match));
        if (result === false) return `Source ${handle.sourceKey} rejected the Subscription scope`;
      } catch (error) {
        return errorMessage(error);
      }
    }
    return null;
  }

  requireSubscriptionScope(match) {
    const error = this.subscriptionScopeError(match);
    if (error) {
      const wrapped = new Error(error);
      wrapped.code = "MATCH_SCOPE_INVALID";
      throw wrapped;
    }
  }

  isSessionArchived(sessionId) {
    return this.archivedSessionIds.has(String(sessionId));
  }

  async setArchivedSessions(sessionIds) {
    if (!Array.isArray(sessionIds)) throw new TypeError("Archived session list must be an array");
    const next = new Set(sessionIds.map((sessionId) => String(sessionId)));
    this.archivedSessionIds = next;
    if (next.size === 0) return { discarded: 0 };
    return this.repository.transact((state) => {
      let discarded = 0;
      let changed = false;
      for (const [deliveryId, delivery] of Object.entries(state.deliveries)) {
        if (!next.has(delivery.sessionId) || !["queued", "deferred"].includes(delivery.state)) continue;
        if (Object.values(state.batches).some((batch) => batch.state === "injecting" && batch.deliveryIds.includes(deliveryId))) continue;
        delete state.deliveries[deliveryId];
        discarded += 1;
        changed = true;
      }
      for (const batch of Object.values(state.batches)) {
        if (batch.state !== "planned" || !next.has(batch.sessionId)) continue;
        const remaining = batch.deliveryIds.filter((deliveryId) => state.deliveries[deliveryId]?.state === "queued");
        if (remaining.length !== batch.deliveryIds.length) {
          batch.deliveryIds = remaining;
          changed = true;
        }
        if (remaining.length === 0) {
          batch.state = "cancelled";
          changed = true;
        }
      }
      return { value: { discarded }, commit: changed };
    });
  }

  async subscribe(sessionId, input, audit = {}) {
    const match = validateMatch(input?.match);
    const expiresAt = input?.expiresAt === undefined || input.expiresAt === null ? null : isoTime(input.expiresAt, "expiresAt");
    if (expiresAt && Date.parse(expiresAt) <= this.now()) throw new TypeError("expiresAt must be in the future");
    this.requireSubscriptionScope(match);
    const createdAt = nowIso(this.now);
    return this.repository.transact((state) => {
      const owned = Object.values(state.subscriptions).filter((subscription) => subscription.sessionId === sessionId).length;
      if (owned >= this.config.maxSubscriptionsPerSession) throw new Error("Current Session has reached its Subscription limit");
      if (Object.keys(state.subscriptions).length >= this.config.maxSubscriptions) throw new Error("Mailbox Subscription capacity is full");
      const subscriptionId = id("sub");
      const subscriptionSeq = state.nextSubscriptionSeq++;
      const subscription = {
        subscriptionId,
        subscriptionSeq,
        sessionId,
        match,
        enabled: true,
        expiresAt,
        createdAt,
        updatedAt: createdAt,
        createdFrom: {
          actor: "agent-on-behalf-of-user",
          requestSeq: Number.isSafeInteger(audit.requestSeq) ? audit.requestSeq : null,
        },
        lastMatchedAt: null,
        matchCount: 0,
      };
      state.subscriptions[subscriptionId] = subscription;
      return { value: { subscription: clone(subscription) } };
    });
  }

  async listSubscriptions(sessionId, input = {}) {
    const limit = Math.min(input.limit ?? this.config.historyPageSize, this.config.maxHistoryPageSize);
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("limit is invalid");
    const rows = this.repository.read((state) => Object.values(state.subscriptions)
      .filter((subscription) => subscription.sessionId === sessionId)
      .sort((a, b) => compareCoreTime(b.createdAt, a.createdAt, b.subscriptionSeq, a.subscriptionSeq))
      .map((subscription) => ({
        ...clone(subscription),
        effectiveEnabled: subscriptionActive(subscription, this.now()),
        scopeWarning: this.subscriptionScopeError(subscription.match),
      })));
    const page = pageAfterCursor(rows.map((row) => ({ ...row, id: row.subscriptionId })), input.cursor);
    const selected = page.slice(0, limit);
    const next = page.length > limit ? page[limit - 1] : null;
    return {
      subscriptions: selected.map(({ id: _id, ...subscription }) => subscription),
      nextCursor: next ? encodeCursor({ createdAt: next.createdAt, id: next.subscriptionId }) : null,
    };
  }

  async updateSubscription(sessionId, subscriptionId, patch) {
    if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) throw new TypeError("Subscription update cannot be empty");
    for (const key of Object.keys(patch)) if (!["enabled", "match", "expiresAt"].includes(key)) throw new TypeError(`Unsupported Subscription update field: ${key}`);
    const match = patch.match === undefined ? undefined : validateMatch(patch.match);
    if (match !== undefined) this.requireSubscriptionScope(match);
    const expiresAt = patch.expiresAt === undefined ? undefined : patch.expiresAt === null ? null : isoTime(patch.expiresAt, "expiresAt");
    if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") throw new TypeError("enabled must be boolean");
    const updatedAt = nowIso(this.now);
    const result = await this.repository.transact((state) => {
      const subscription = state.subscriptions[subscriptionId];
      if (!subscription || subscription.sessionId !== sessionId) throw new Error("Subscription does not belong to the current Session");
      if (match !== undefined) subscription.match = match;
      if (expiresAt !== undefined) subscription.expiresAt = expiresAt;
      if (patch.enabled !== undefined) subscription.enabled = patch.enabled;
      subscription.updatedAt = updatedAt;
      for (const delivery of Object.values(state.deliveries)) {
        if (delivery.sessionId !== sessionId || delivery.state !== "queued" || isInFlight(state, delivery.deliveryId)) continue;
        const active = delivery.matchedSubscriptionIds.some((id) => {
          const candidate = state.subscriptions[id];
          return candidate && subscriptionActive(candidate, this.now());
        });
        if (!active) {
          delivery.state = "cancelled";
          delivery.cancelledAt = updatedAt;
          delivery.updatedAt = updatedAt;
        }
      }
      for (const batch of Object.values(state.batches)) {
        if (batch.sessionId !== sessionId || batch.state !== "planned") continue;
        batch.deliveryIds = batch.deliveryIds.filter((id) => state.deliveries[id]?.state === "queued");
        if (batch.deliveryIds.length === 0) batch.state = "cancelled";
      }
      return { value: { subscription: clone(subscription) } };
    });
    this.scheduler.notify(sessionId, 0);
    return result;
  }

  history(sessionId, input = {}) {
    const limit = Math.min(input.limit ?? this.config.historyPageSize, this.config.maxHistoryPageSize);
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("limit is invalid");
    const states = input.states ?? ["delivered", "deferred"];
    if (!Array.isArray(states) || states.length === 0 || states.some((state) => !["queued", "delivered", "deferred", "cancelled", "dead-letter"].includes(state))) {
      throw new TypeError("states contains an unsupported Delivery state");
    }
    const from = input.receivedAfter ? Date.parse(isoTime(input.receivedAfter, "receivedAfter")) : -Infinity;
    const to = input.receivedBefore ? Date.parse(isoTime(input.receivedBefore, "receivedBefore")) : Infinity;
    const keyword = input.textContains ? normalizeSearchText(input.textContains) : null;
    const rows = this.repository.read((state) => Object.values(state.deliveries)
      .filter((delivery) => {
        if (delivery.sessionId !== sessionId || !states.includes(delivery.state)) return false;
        const mail = state.mails[delivery.mailId];
        if (!mail) return false;
        if (input.sourceId && mail.sourceId !== input.sourceId) return false;
        if (input.sourceInstance && mail.sourceInstance !== input.sourceInstance) return false;
        if (input.subscriptionId && !delivery.matchedSubscriptionIds.includes(input.subscriptionId)) return false;
        const received = Date.parse(mail.receivedAt);
        if (received < from || received > to) return false;
        if (keyword && !normalizeSearchText(mail.content.text).includes(keyword)) return false;
        return true;
      })
      .sort((a, b) => compareCoreTime(b.createdAt, a.createdAt, b.deliverySeq, a.deliverySeq))
      .map((delivery) => ({
        ...mailSummary(state.mails[delivery.mailId], delivery, this.config.injectionPreviewChars),
        id: delivery.deliveryId,
      })));
    const page = pageAfterCursor(rows, input.cursor);
    const selected = page.slice(0, limit);
    const next = page.length > limit ? page[limit - 1] : null;
    return {
      deliveries: selected.map(({ id: _id, ...delivery }) => delivery),
      nextCursor: next ? encodeCursor({ createdAt: next.createdAt, id: next.deliveryId }) : null,
    };
  }

  get(sessionId, input) {
    return this.repository.read((state) => {
      const delivery = ownDelivery(state, sessionId, input?.deliveryId);
      const mail = state.mails[delivery.mailId];
      if (!mail) throw new Error("The Mail is outside the configured retention window");
      const offset = input.offset ?? 0;
      const limit = Math.min(input.limit ?? this.config.getPageChars, this.config.maxGetPageChars);
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) throw new TypeError("Text paging arguments are invalid");
      const totalChars = mail.content.text.length;
      const nextOffset = Math.min(totalChars, offset + limit);
      return {
        delivery: clone(delivery),
        mail: {
          ...clone(mail),
          content: {
            ...clone(mail.content),
            text: mail.content.text.slice(offset, nextOffset),
          },
        },
        textPage: {
          offset,
          returnedChars: nextOffset - offset,
          totalChars,
          nextOffset: nextOffset < totalChars ? nextOffset : null,
          truncated: nextOffset < totalChars,
        },
      };
    });
  }

  async defer(sessionId, input) {
    const until = isoTime(input?.until, "until");
    const delay = Date.parse(until) - this.now();
    if (delay <= 0) throw new TypeError("until must be in the future");
    const updatedAt = nowIso(this.now);
    const result = await this.repository.transact((state) => {
      const delivery = ownDelivery(state, sessionId, input.deliveryId);
      if (!["delivered", "deferred"].includes(delivery.state)) throw new Error("Only an injected Delivery can be deferred");
      delivery.state = "deferred";
      delivery.deferUntil = until;
      delivery.updatedAt = updatedAt;
      return { value: { delivery: clone(delivery) } };
    });
    this.scheduler.notify(sessionId, Math.min(this.config.mergeWindowMs, delay));
    return result;
  }

  attachAgent(agent) {
    this.scheduler.attach(agent);
  }

  detachAgent(sessionId) {
    this.scheduler.detach(sessionId);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const handle of [...this.sources.values()]) this.disposeSource(handle);
    await this.scheduler.close();
    await this.repository.close();
  }
}
