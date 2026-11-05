import { normalizeConfig } from "../lib/config.js";
import { AgentMailbox } from "../lib/mailbox.js";
import { emptyState } from "../lib/model.js";
import { MailboxRepository } from "../lib/store.js";
import { clone } from "../lib/util.js";

export class MemoryGlobal {
  constructor() {
    this.value = emptyState();
    this.writes = 0;
    this.failNext = false;
    this.gate = null;
  }

  get() {
    return clone(this.value);
  }

  async set(value) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("injected storage failure");
    }
    if (this.gate) await this.gate;
    await new Promise((resolve) => setImmediate(resolve));
    this.value = clone(value);
    this.writes += 1;
  }
}

export function testConfig(overrides = {}) {
  return normalizeConfig({
    mergeWindowMs: 0,
    recoveryIntervalMs: 0,
    wakeCooldownMs: 0,
    retryBaseMs: 2,
    retryAfterMs: 5,
    ...overrides,
  });
}

export function createCore({ global = new MemoryGlobal(), config = testConfig(), flush = async () => true, now = Date.now } = {}) {
  const repository = new MailboxRepository({ global, now });
  const service = new AgentMailbox({ repository, config, now, flush });
  return { global, repository, service, config };
}

export function registerLark(service) {
  return service.registerSource({
    sourceId: "lark",
    instance: "main",
    displayName: "Lark",
    kinds: ["message.received"],
    filterFields: ["sourceId", "sourceInstance", "kinds", "conversationIds", "textContainsAny", "textContainsAll"],
    capabilities: { reply: false, threadContext: false },
  });
}

export function envelope(eventId = "evt-1", text = "编译失败", overrides = {}) {
  return {
    specVersion: 1,
    eventId,
    kind: "message.received",
    occurredAt: "2026-11-05T12:20:00+08:00",
    actor: { externalId: "sender-id", displayName: "张三" },
    conversation: { externalId: "chat-id", threadId: "thread-id" },
    content: { text, attachments: [] },
    priorityHint: "normal",
    collapseKey: "lark:chat-id:thread-id",
    actionRef: "opaque-source-reference",
    attributes: { "lark.identityMode": "user" },
    ...overrides,
  };
}

export async function subscribe(service, sessionId, extra = {}) {
  return (await service.subscribe(sessionId, {
    match: { sourceId: "lark", ...extra },
    expiresAt: null,
  })).subscription;
}

export function fakeAgent(sessionId, status = "idle") {
  const listeners = new Map();
  const agent = {
    id: sessionId,
    status,
    injected: [],
    followups: [],
    flushCount: 0,
    inbox: { nextStep: [], nextTurn: [] },
    ctx: {
      on(name, listener) {
        const entries = listeners.get(name) || new Set();
        entries.add(listener);
        listeners.set(name, entries);
        return () => entries.delete(listener);
      },
    },
    session: {
      events: [],
      snapshotEvents() {
        return JSON.parse(JSON.stringify(this.events));
      },
    },
    _seq: 0,
    setStatus(next) {
      if (this.status === next) return;
      this.status = next;
      for (const listener of listeners.get("agent/status") || []) listener({ agent: this, status: next });
    },
    inject(message) {
      this.injected.push(clone(message));
      this.inbox.nextStep.push(clone(message));
      this.session.events.push({
        type: "agent/inbox/spliced",
        seq: ++this._seq,
        time: Date.now(),
        data: { target: "next-step", start: 0, inserted: [clone(message)] },
      });
    },
    followup(message) {
      this.followups.push(clone(message));
      this.inbox.nextTurn.push(clone(message));
      this.session.events.push({
        type: "agent/inbox/spliced",
        seq: ++this._seq,
        time: Date.now(),
        data: { target: "next-turn", start: 0, inserted: [clone(message)] },
      });
      this.setStatus("running");
    },
    admitMailboxBatches() {
      for (const message of this.injected) {
        if (this.session.events.some((event) => event.type === "user/message" && event.data.id === message.id)) continue;
        this.inbox.nextStep = this.inbox.nextStep.filter((pending) => pending.id !== message.id);
        this.session.events.push({
          type: "agent/inbox/spliced",
          seq: ++this._seq,
          time: Date.now(),
          data: { target: "next-step", start: 0, removedCount: 1, inserted: [] },
        });
        this.session.events.push({
          type: "user/message",
          seq: ++this._seq,
          time: Date.now(),
          data: clone(message),
          surfaceOp: "append",
        });
      }
    },
  };
  return agent;
}

export async function waitFor(predicate, message = "condition", timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${message}`);
}

export function deliveries(repository, sessionId) {
  return repository.read((state) => Object.values(state.deliveries)
    .filter((delivery) => !sessionId || delivery.sessionId === sessionId)
    .sort((a, b) => a.deliverySeq - b.deliverySeq));
}
