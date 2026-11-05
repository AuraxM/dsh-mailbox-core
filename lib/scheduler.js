import { batchText } from "./model.js";
import { clone, compareCoreTime, deepFreeze, errorMessage, id, nowIso, safeCall } from "./util.js";

const MAX_TIMER_DELAY = 2_147_000_000;

function defaultTimer() {
  return {
    timeout(callback, delay) {
      const handle = setTimeout(callback, delay);
      handle.unref?.();
      return () => clearTimeout(handle);
    },
    interval(callback, delay) {
      const handle = setInterval(callback, delay);
      handle.unref?.();
      return () => clearInterval(handle);
    },
  };
}

function messageForBatch(batch, text) {
  return deepFreeze({
    id: batch.messageId,
    role: "user",
    content: [{ type: "text", text }],
    source: {
      kind: "agent-mailbox",
      form: "mailbox-batch",
      batchId: batch.batchId,
      deliveryIds: [...batch.deliveryIds],
      summary: `Mailbox batch ${batch.batchId} with ${batch.deliveryIds.length} deliveries`,
    },
  });
}

function wakeForBatch(batch) {
  return deepFreeze({
    id: batch.wakeMessageId,
    role: "user",
    content: [{ type: "text", text: `Mailbox batch ${batch.batchId} is available in the adjacent injected context.` }],
    source: {
      kind: "agent-mailbox",
      form: "mailbox-wake",
      batchId: batch.batchId,
      deliveryIds: [...batch.deliveryIds],
      summary: `Wake for Mailbox batch ${batch.batchId}`,
    },
  });
}

function isInFlight(state, deliveryId) {
  return Object.values(state.batches).some((batch) => batch.state === "injecting" && batch.deliveryIds.includes(deliveryId));
}

/** Per-Agent delivery scheduler. All durable transitions go through MailboxRepository's write chain. */
export class MailboxScheduler {
  constructor({ repository, config, now, logger = () => {}, timer, flush }) {
    this.repository = repository;
    this.config = config;
    this.now = now;
    this.logger = logger;
    this.timer = timer || defaultTimer();
    this.flush = flush || (async () => false);
    this.agents = new Map();
    this.closed = false;
  }

  attach(agent) {
    const sessionId = String(agent.id);
    this.detach(sessionId);
    const runtime = {
      agent,
      running: false,
      again: false,
      disposed: false,
      timer: null,
      scheduledAt: 0,
      recoveryTimer: null,
      scopeListeners: [],
      retryNotBefore: 0,
      lastWakeAt: 0,
      drain: null,
      resolveDrain: null,
    };
    this.agents.set(sessionId, runtime);
    if (typeof agent.ctx?.on === "function") {
      runtime.scopeListeners.push(agent.ctx.on("agent/status", ({ status }) => {
        if (status === "idle") this.schedule(sessionId, 0);
      }));
    }
    if (this.config.recoveryIntervalMs > 0) {
      runtime.recoveryTimer = this.timer.interval(() => {
        this.pump(sessionId).catch((error) => this.logError(sessionId, error));
      }, this.config.recoveryIntervalMs);
    }
    // Deliberately fire-and-forget: agent/created must not await recovery or agent idleness.
    this.schedule(sessionId, 0);
  }

  detach(sessionId) {
    const runtime = this.agents.get(String(sessionId));
    if (!runtime) return;
    runtime.disposed = true;
    safeCall(runtime.timer, this.logger, "Mailbox flush timer cleanup");
    safeCall(runtime.recoveryTimer, this.logger, "Mailbox recovery timer cleanup");
    for (const dispose of runtime.scopeListeners) safeCall(dispose, this.logger, "Mailbox Agent listener cleanup");
    this.agents.delete(String(sessionId));
  }

  notify(sessionId, delay = this.config.mergeWindowMs) {
    this.schedule(sessionId, delay);
  }

  schedule(sessionId, delay) {
    const runtime = this.agents.get(String(sessionId));
    if (!runtime || runtime.disposed || this.closed) return;
    const bounded = Math.max(0, Math.min(MAX_TIMER_DELAY, Math.ceil(delay)));
    const at = this.now() + bounded;
    if (runtime.timer && runtime.scheduledAt <= at) return;
    safeCall(runtime.timer, this.logger, "Mailbox timer replacement");
    runtime.scheduledAt = at;
    runtime.timer = this.timer.timeout(() => {
      runtime.timer = null;
      runtime.scheduledAt = 0;
      this.pump(sessionId).catch((error) => this.logError(sessionId, error));
    }, bounded);
  }

  async pump(sessionId) {
    const runtime = this.agents.get(String(sessionId));
    if (!runtime || runtime.disposed || this.closed) return;
    if (runtime.running) {
      runtime.again = true;
      return;
    }
    runtime.running = true;
    runtime.drain = new Promise((resolve) => { runtime.resolveDrain = resolve; });
    let more = false;
    try {
      more = await this.pumpOnce(runtime);
    } catch (error) {
      runtime.retryNotBefore = this.now() + this.config.retryBaseMs;
      this.logError(sessionId, error);
    } finally {
      runtime.running = false;
      if (!runtime.disposed && !this.closed) {
        if (runtime.again) {
          runtime.again = false;
          more = true;
        }
        if (more) this.schedule(sessionId, this.config.mergeWindowMs);
        else this.scheduleNext(runtime);
      }
      const resolve = runtime.resolveDrain;
      runtime.drain = null;
      runtime.resolveDrain = null;
      resolve?.();
    }
  }

  async pumpOnce(runtime) {
    const sessionId = String(runtime.agent.id);
    await this.reconcile(runtime.agent);
    await this.recoverStaleInFlight(runtime);
    await this.releaseDue(sessionId);
    await this.recoverUnadmitted(runtime);
    if (this.repository.read((state) => Object.values(state.batches).some((batch) =>
      batch.sessionId === sessionId && batch.state === "injecting"))) return false;
    const nowMs = this.now();
    if (runtime.retryNotBefore > nowMs) {
      this.schedule(sessionId, runtime.retryNotBefore - nowMs);
      return false;
    }
    const work = this.repository.read((state) => ({
      queued: Object.values(state.deliveries).some((delivery) => delivery.sessionId === sessionId && delivery.state === "queued"),
      planned: Object.values(state.batches).some((batch) => batch.sessionId === sessionId && batch.state === "planned"),
    }));
    if (!work.queued && !work.planned) return false;
    if (runtime.agent.status !== "running" && runtime.lastWakeAt > 0) {
      const wait = runtime.lastWakeAt + this.config.wakeCooldownMs - nowMs;
      if (wait > 0) {
        this.schedule(sessionId, wait);
        return false;
      }
    }
    const batch = await this.prepareBatch(sessionId);
    if (!batch) return false;
    await this.injectBatch(runtime, batch.batchId);
    return this.repository.read((state) => Object.values(state.deliveries).some((delivery) =>
      delivery.sessionId === sessionId && delivery.state === "queued"));
  }

  /**
   * A persisted `injecting` batch with no log evidence means the process died
   * after writing the lease but before `agent.inject()`. Roll it back to
   * planned so it can be retried (or dead-letter once attempts are exhausted).
   * If there is log evidence, reconcile has already promoted it; a flush
   * failure prevents reaching this point and leaves the lease intact.
   */
  async recoverStaleInFlight(runtime) {
    const sessionId = String(runtime.agent.id);
    const found = this.scanLog(runtime.agent);
    const now = nowIso(this.now);
    const result = await this.repository.transact((state) => {
      let changed = false;
      for (const batch of Object.values(state.batches)) {
        if (batch.sessionId !== sessionId || batch.state !== "injecting") continue;
        const evidence = found.get(batch.batchId);
        if (evidence?.injected && evidence.messageId === batch.messageId) continue;
        const exhausted = batch.deliveryIds.some((deliveryId) => {
          const delivery = state.deliveries[deliveryId];
          return delivery && delivery.attempts >= this.config.maxInjectAttempts;
        });
        if (exhausted) {
          for (const deliveryId of batch.deliveryIds) {
            const delivery = state.deliveries[deliveryId];
            if (!delivery || delivery.state !== "queued") continue;
            delivery.state = "dead-letter";
            delivery.deadLetterAt = now;
            delivery.updatedAt = now;
            delivery.lastError = "injection lease expired before log evidence";
          }
          batch.state = "cancelled";
        } else {
          batch.state = "planned";
          batch.injectStartedAt = null;
        }
        changed = true;
      }
      return { value: changed, commit: changed };
    });
    return result ? 1 : 0;
  }

  async releaseDue(sessionId) {
    const now = nowIso(this.now);
    const nowMs = Date.parse(now);
    return this.repository.transact((state) => {
      let changed = false;
      for (const delivery of Object.values(state.deliveries)) {
        if (delivery.sessionId !== sessionId) continue;
        if (delivery.state === "deferred" && Date.parse(delivery.deferUntil) <= nowMs) {
          delivery.state = "queued";
          delivery.updatedAt = now;
          changed = true;
        }
        if (delivery.state !== "queued" || isInFlight(state, delivery.deliveryId)) continue;
        const active = delivery.matchedSubscriptionIds.some((subscriptionId) => {
          const subscription = state.subscriptions[subscriptionId];
          return subscription && subscription.enabled === true &&
            (subscription.expiresAt === null || Date.parse(subscription.expiresAt) > nowMs);
        });
        if (!active) {
          delivery.state = "cancelled";
          delivery.cancelledAt = now;
          delivery.updatedAt = now;
          changed = true;
        }
      }
      for (const batch of Object.values(state.batches)) {
        if (batch.sessionId !== sessionId || batch.state !== "planned") continue;
        const deliveryIds = batch.deliveryIds.filter((deliveryId) => state.deliveries[deliveryId]?.state === "queued");
        if (deliveryIds.length !== batch.deliveryIds.length) changed = true;
        batch.deliveryIds = deliveryIds;
        if (deliveryIds.length === 0) batch.state = "cancelled";
      }
      return { value: changed, commit: changed };
    });
  }

  async prepareBatch(sessionId) {
    const createdAt = nowIso(this.now);
    return this.repository.transact((state) => {
      const existing = Object.values(state.batches)
        .filter((batch) => batch.sessionId === sessionId && batch.state === "planned")
        .sort((a, b) => compareCoreTime(a.createdAt, b.createdAt, a.batchId.localeCompare(b.batchId), 0))[0];
      if (existing) return { value: existing, commit: false };
      const candidates = Object.values(state.deliveries)
        .filter((delivery) => delivery.sessionId === sessionId && delivery.state === "queued")
        .sort((a, b) => compareCoreTime(a.createdAt, b.createdAt, a.deliverySeq, b.deliverySeq));
      if (candidates.length === 0) return { value: null, commit: false };
      const selected = [];
      let budget = 512;
      for (const delivery of candidates) {
        const mail = state.mails[delivery.mailId];
        if (!mail) continue;
        const cost = Math.min(mail.content.text.length, this.config.injectionPreviewChars) + 768 +
          JSON.stringify(delivery.matchedSubscriptionIds).length + JSON.stringify(mail.actor).length + JSON.stringify(mail.conversation).length;
        if (selected.length > 0 && (selected.length >= this.config.batchSize || budget + cost > this.config.maxBatchChars)) break;
        if (selected.length === 0 || budget + cost <= this.config.maxBatchChars) {
          selected.push(delivery);
          budget += cost;
        }
        if (selected.length >= this.config.batchSize) break;
      }
      if (selected.length === 0) return { value: null, commit: false };
      const batches = Object.values(state.batches);
      if (batches.length >= this.config.maxBatches) {
        const removable = batches
          .filter((batch) => batch.state === "injected" || batch.state === "cancelled")
          .sort((a, b) => compareCoreTime(a.createdAt, b.createdAt, a.batchId.localeCompare(b.batchId), 0));
        while (Object.keys(state.batches).length >= this.config.maxBatches && removable.length) {
          delete state.batches[removable.shift().batchId];
        }
        if (Object.keys(state.batches).length >= this.config.maxBatches) throw new Error("Mailbox batch capacity is exhausted");
      }
      const batchId = id("mb");
      const batch = {
        batchId,
        sessionId,
        deliveryIds: selected.map((delivery) => delivery.deliveryId),
        messageId: `mailbox-batch-${batchId}`,
        wakeMessageId: `mailbox-wake-${batchId}`,
        state: "planned",
        injectStartedAt: null,
        createdAt,
        injectedAt: null,
        eventSeq: null,
      };
      state.batches[batchId] = batch;
      for (const delivery of selected) {
        delivery.injectionHistory.push({
          batchId,
          messageId: batch.messageId,
          createdAt,
          injectedAt: null,
          eventSeq: null,
        });
        delivery.updatedAt = createdAt;
      }
      return { value: batch };
    });
  }

  scanLog(agent) {
    const found = new Map();
    if (!agent.session || typeof agent.session.snapshotEvents !== "function") return found;
    for (const event of agent.session.snapshotEvents()) {
      const inspect = (message, admitted) => {
        const source = message?.source;
        if (message?.role !== "user" || source?.kind !== "agent-mailbox" || typeof source.batchId !== "string") return;
        if (source.form !== "mailbox-batch" && source.form !== "mailbox-wake") return;
        const evidence = found.get(source.batchId) || {
          messageId: null,
          eventSeq: null,
          injected: false,
          admitted: false,
          wakeSeen: false,
        };
        if (source.form === "mailbox-wake") {
          evidence.wakeSeen = true;
        } else {
          evidence.messageId = message.id;
          evidence.eventSeq ??= event.seq;
          evidence.injected = true;
          if (admitted) evidence.admitted = true;
        }
        found.set(source.batchId, evidence);
      };
      if (event.type === "agent/inbox/spliced") {
        for (const message of event.data?.inserted || []) inspect(message, false);
      } else if (event.type === "user/message") inspect(event.data, true);
    }
    return found;
  }

  async reconcile(agent) {
    const found = this.scanLog(agent);
    if (found.size === 0) return 0;
    const sessionId = String(agent.id);
    const candidates = this.repository.read((state) => [...found.entries()].filter(([batchId, evidence]) => {
      const batch = state.batches[batchId];
      return evidence.injected && batch && batch.sessionId === sessionId &&
        ["planned", "injecting"].includes(batch.state) && batch.messageId === evidence.messageId;
    }));
    if (candidates.length === 0) return 0;
    // Log evidence alone is insufficient: acknowledge it only after the durability checkpoint.
    await this.flush(agent.session);
    const injectedAt = nowIso(this.now);
    return this.repository.transact((state) => {
      let changed = false;
      for (const [batchId, evidence] of candidates) {
        const batch = state.batches[batchId];
        if (!batch || batch.sessionId !== sessionId || !["planned", "injecting"].includes(batch.state)) continue;
        if (batch.messageId !== evidence.messageId) continue;
        changed = this.markBatchInjected(state, batch, evidence.eventSeq, injectedAt) || changed;
      }
      return { value: changed, commit: changed };
    });
  }

  markBatchInjected(state, batch, eventSeq, injectedAt) {
    if (!["planned", "injecting"].includes(batch.state)) return false;
    batch.state = "injected";
    batch.injectedAt = injectedAt;
    batch.eventSeq = eventSeq ?? null;
    for (const deliveryId of batch.deliveryIds) {
      const delivery = state.deliveries[deliveryId];
      if (!delivery) continue;
      const history = delivery.injectionHistory.find((entry) => entry.batchId === batch.batchId);
      if (history) {
        history.injectedAt = injectedAt;
        history.eventSeq = eventSeq ?? null;
      }
      if (!delivery.injectedBatchIds.includes(batch.batchId)) delivery.injectedBatchIds.push(batch.batchId);
      delivery.injectionCount = delivery.injectedBatchIds.length;
      if (delivery.deliveredAt === null) delivery.deliveredAt = injectedAt;
      delivery.deferUntil = null;
      delivery.state = "delivered";
      delivery.lastError = null;
      delivery.updatedAt = injectedAt;
    }
    return true;
  }

  async recoverUnadmitted(runtime) {
    const agent = runtime.agent;
    if (agent.status === "running" || !agent.inbox || !Array.isArray(agent.inbox.nextStep)) return 0;
    const sessionId = String(agent.id);
    const found = this.scanLog(agent);
    const batch = this.repository.read((state) => Object.values(state.batches)
      .filter((candidate) => {
        if (candidate.sessionId !== sessionId || candidate.state !== "injected") return false;
        const evidence = found.get(candidate.batchId);
        return evidence?.injected && !evidence.admitted && !evidence.wakeSeen &&
          agent.inbox.nextStep.some((message) => message.id === candidate.messageId);
      })
      .sort((a, b) => compareCoreTime(a.createdAt, b.createdAt, a.batchId.localeCompare(b.batchId), 0))[0]);
    if (!batch) return 0;
    const wait = runtime.lastWakeAt > 0 ? runtime.lastWakeAt + this.config.wakeCooldownMs - this.now() : 0;
    if (wait > 0) {
      this.schedule(sessionId, wait);
      return 0;
    }
    if (typeof agent.followup !== "function") throw new Error("Current Agent does not provide followup()");
    agent.followup(wakeForBatch(batch));
    // A successful followup is a wake even if the subsequent checkpoint fails.
    runtime.lastWakeAt = this.now();
    await this.flush(agent.session);
    return 1;
  }

  async injectBatch(runtime, batchId) {
    if (runtime.disposed || this.closed) return;
    const agent = runtime.agent;
    const sessionId = String(agent.id);
    const logged = this.scanLog(agent).get(batchId);
    if (logged?.injected) {
      await this.reconcile(agent);
      return;
    }
    let batch = this.repository.read((state) => state.batches[batchId]);
    if (!batch || batch.state !== "planned") return;
    let injected = false;
    try {
      if (typeof agent.inject !== "function") throw new Error("Current Agent does not provide inject()");
      const injectStartedAt = nowIso(this.now);
      // Build the render text and freeze the batch as injecting in the same
      // serialized transaction. A concurrent Subscription update therefore
      // cannot change deliveryIds between rendering and injection.
      const prepared = await this.repository.transact((state) => {
        const current = state.batches[batchId];
        if (!current || current.state !== "planned") return { value: null, commit: false };
        const text = batchText(current, state.mails, state.deliveries, this.config);
        current.state = "injecting";
        current.injectStartedAt = injectStartedAt;
        const updatedAt = nowIso(this.now);
        for (const deliveryId of current.deliveryIds) {
          const delivery = state.deliveries[deliveryId];
          if (!delivery || delivery.state !== "queued") continue;
          delivery.attempts += 1;
          delivery.updatedAt = updatedAt;
        }
        return { value: { batch: clone(current), text }, commit: true };
      });
      if (!prepared) return;
      batch = prepared.batch;
      if (runtime.disposed || this.closed) throw new Error("Agent was disposed before Mailbox injection");
      const wasRunning = agent.status === "running";
      agent.inject(messageForBatch(batch, prepared.text));
      // From this point onward, failure means reconcile an existing log record, never retry as absent work.
      injected = true;
      if (!wasRunning) {
        if (typeof agent.followup !== "function") throw new Error("Current Agent does not provide followup()");
        agent.followup(wakeForBatch(batch));
        runtime.lastWakeAt = this.now();
      }
      await this.flush(agent.session);
      const evidence = this.scanLog(agent).get(batchId);
      if (!evidence?.injected || evidence.messageId !== batch.messageId) {
        throw new Error("Mailbox batch is absent from the durable Session log after injection");
      }
      const injectedAt = nowIso(this.now);
      await this.repository.transact((state) => {
        const current = state.batches[batchId];
        if (!current || !["planned", "injecting"].includes(current.state)) return { value: false, commit: false };
        return { value: this.markBatchInjected(state, current, evidence.eventSeq, injectedAt) };
      });
      runtime.retryNotBefore = 0;
    } catch (error) {
      if (injected) {
        runtime.retryNotBefore = this.now() + this.config.retryBaseMs;
        throw error;
      }
      await this.recordInjectionFailure(sessionId, batchId, error);
      const oldestAttempts = this.repository.read((state) => Math.max(1, ...Object.values(state.deliveries)
        .filter((delivery) => delivery.sessionId === sessionId && batch.deliveryIds.includes(delivery.deliveryId))
        .map((delivery) => delivery.attempts)));
      runtime.retryNotBefore = this.now() + Math.min(60000, this.config.retryBaseMs * 2 ** (oldestAttempts - 1));
      throw error;
    }
  }

  async recordInjectionFailure(sessionId, batchId, error) {
    const updatedAt = nowIso(this.now);
    const message = errorMessage(error);
    await this.repository.transact((state) => {
      const batch = state.batches[batchId];
      if (!batch || !["planned", "injecting"].includes(batch.state)) return { value: false, commit: false };
      const countAttempt = batch.state === "planned";
      batch.state = "planned";
      let active = 0;
      for (const deliveryId of batch.deliveryIds) {
        const delivery = state.deliveries[deliveryId];
        if (!delivery || delivery.state !== "queued") continue;
        if (countAttempt) delivery.attempts += 1;
        delivery.lastError = message;
        delivery.updatedAt = updatedAt;
        if (delivery.attempts >= this.config.maxInjectAttempts) {
          delivery.state = "dead-letter";
          delivery.deadLetterAt = updatedAt;
        } else active += 1;
      }
      if (active === 0) batch.state = "cancelled";
      return { value: true };
    });
  }

  scheduleNext(runtime) {
    const sessionId = String(runtime.agent.id);
    const next = this.repository.read((state) => {
      let nextAt = runtime.retryNotBefore > this.now() ? runtime.retryNotBefore : Infinity;
      let hasQueued = false;
      for (const delivery of Object.values(state.deliveries)) {
        if (delivery.sessionId !== sessionId) continue;
        if (delivery.state === "queued") hasQueued = true;
        if (delivery.state === "deferred") nextAt = Math.min(nextAt, Date.parse(delivery.deferUntil));
      }
      if (Object.values(state.batches).some((batch) => batch.sessionId === sessionId && ["planned", "injecting"].includes(batch.state))) hasQueued = true;
      return { nextAt, hasQueued };
    });
    if (Number.isFinite(next.nextAt)) this.schedule(sessionId, Math.max(0, next.nextAt - this.now()));
    else if (next.hasQueued) this.schedule(sessionId, this.config.mergeWindowMs);
  }

  logError(sessionId, error) {
    this.logger("warn", `agent-mailbox: delivery for ${sessionId}: ${errorMessage(error)}`);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const active = [...this.agents.values()].map((runtime) => runtime.drain).filter(Boolean);
    for (const sessionId of [...this.agents.keys()]) this.detach(sessionId);
    await Promise.all(active);
    await this.repository.tail;
  }
}
