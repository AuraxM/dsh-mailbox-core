import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../index.js";
import { MemoryGlobal } from "./helpers.js";
import { createMailboxTools, MAILBOX_PROMPT } from "../lib/tools.js";
import { createCore, deliveries, envelope, registerLark, subscribe } from "./helpers.js";

test("exactly ten model tools are exposed with current-Session implicit ownership", async (t) => {
  const { service } = createCore();
  t.after(() => service.close());
  const tools = createMailboxTools(service);
  assert.deepEqual(tools.map((tool) => tool.name), [
    "mailbox_sources",
    "mailbox_filter_reference",
    "mailbox_field_values",
    "mailbox_filter_test",
    "mailbox_subscribe",
    "mailbox_subscriptions",
    "mailbox_subscription_update",
    "mailbox_history",
    "mailbox_get",
    "mailbox_defer",
  ]);
  const serialized = JSON.stringify(tools.map((tool) => tool.parameters));
  assert.equal(serialized.includes("targetSessionId"), false);
  const agent = { id: "session-a" };
  const subscribed = await tools.find((tool) => tool.name === "mailbox_subscribe").execute({
    match: { sourceId: "lark" },
    expiresAt: null,
  }, { agent });
  assert.equal(subscribed.subscription.sessionId, "session-a");
  await assert.rejects(() => tools.find((tool) => tool.name === "mailbox_subscription_update").execute({
    subscriptionId: subscribed.subscription.subscriptionId,
    enabled: false,
  }, { agent: { id: "session-b" } }), /current Session/);
});

test("agent-facing source discovery omits human transport diagnostics", async (t) => {
  const { service } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  const tools = createMailboxTools(service);
  const discover = tools.find((tool) => tool.name === "mailbox_sources");
  let result = await discover.execute({}, {});
  assert.equal(result.sources.length, 1);
  assert.equal(Object.hasOwn(result.sources[0], "status"), false);
  assert.equal(Object.hasOwn(result.sources[0], "updatedAt"), false);
  assert.equal(result.sources[0].deliveryReady, false);
  source.setStatus({ state: "connected", detail: "internal diagnostic text that must stay out of model context" });
  result = await discover.execute({}, {});
  assert.equal(result.sources[0].deliveryReady, true);
  source.setStatus({ state: "degraded", detail: "user polling is active but not real-time" });
  result = await discover.execute({}, {});
  assert.equal(result.sources[0].deliveryReady, true, "degraded transport that is still delivering remains ready");
  source.setStatus({ state: "degraded", detail: "reconnecting", deliveryReady: false });
  result = await discover.execute({}, {});
  assert.equal(result.sources[0].deliveryReady, false);
  assert.equal(JSON.stringify(result).includes("internal diagnostic"), false);
  const deliveryReadySchema = discover.output.schema.properties.sources.items.properties.deliveryReady;
  assert.equal(deliveryReadySchema.type, "boolean");
  assert.match(deliveryReadySchema.description, /delivery is live now/);
  assert.match(discover.output.schema.properties.sources.items.properties.filterFields.description, /Match field names/);
  assert.match(MAILBOX_PROMPT, /Mailbox is the monitoring path/);
  assert.match(MAILBOX_PROMPT, /ask one concise question/);
  assert.match(MAILBOX_PROMPT, /Deferred delivery remains valid/);
  assert.doesNotMatch(MAILBOX_PROMPT, /\b(?:never|do not|don't)\b/i);
  assert.doesNotMatch(tools.map((tool) => tool.description).join("\n"), /\b(?:never|do not|don't)\b/i);
});

test("tool schemas stay inside the Host-enforced raw JSON Schema subset", () => {
  const allowed = new Set(["type", "oneOf", "properties", "required", "additionalProperties", "items", "enum", "const", "description", "title", "default", "examples"]);
  const types = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
  const visit = (schema, path) => {
    for (const key of Object.keys(schema)) assert.ok(allowed.has(key), `${path}.${key} is unsupported`);
    if (schema.type !== undefined) assert.ok(types.has(schema.type), `${path}.type must be one string`);
    if (schema.oneOf !== undefined) schema.oneOf.forEach((branch, index) => visit(branch, `${path}.oneOf[${index}]`));
    if (schema.properties !== undefined) for (const [key, child] of Object.entries(schema.properties)) visit(child, `${path}.properties.${key}`);
    if (schema.items !== undefined) visit(schema.items, `${path}.items`);
  };
  for (const tool of createMailboxTools({})) {
    visit(tool.parameters, `${tool.name}.parameters`);
    visit(tool.output.schema, `${tool.name}.output`);
  }
});

test("history cursor pagination and get text paging are bounded", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  await source.publish(envelope("page-1", "a".repeat(50)));
  await new Promise((resolve) => setTimeout(resolve, 2));
  await source.publish(envelope("page-2", "b".repeat(50)));
  const first = service.history("session-a", { states: ["queued"], limit: 1 });
  assert.equal(first.deliveries.length, 1);
  assert.ok(first.nextCursor);
  const second = service.history("session-a", { states: ["queued"], limit: 1, cursor: first.nextCursor });
  assert.equal(second.deliveries.length, 1);
  assert.notEqual(first.deliveries[0].deliveryId, second.deliveries[0].deliveryId);
  assert.equal(second.nextCursor, null);
  const deliveryId = deliveries(repository)[0].deliveryId;
  const page = service.get("session-a", { deliveryId, offset: 10, limit: 20 });
  assert.equal(page.textPage.offset, 10);
  assert.equal(page.textPage.returnedChars, 20);
  assert.equal(page.textPage.totalChars, 50);
  assert.equal(page.textPage.nextOffset, 30);
  assert.equal(page.textPage.truncated, true);
});

function lifecycleContext(agent, global) {
  const effects = [];
  const listeners = new Map();
  const activeTimers = new Set();
  const activeTools = new Set();
  const webRoutes = new Map();
  const domain = {
    global,
    closed: false,
    async close() { this.closed = true; },
  };
  const ctx = {
    agents: { list: () => [agent] },
    sessions: { flush: async () => true },
    storageDomain: { open: async () => domain },
    webServer: {
      register(route) {
        webRoutes.set(route.path, route);
        return () => webRoutes.delete(route.path);
      },
    },
    timer: {
      timeout() { const dispose = () => activeTimers.delete(dispose); activeTimers.add(dispose); return dispose; },
      interval() { const dispose = () => activeTimers.delete(dispose); activeTimers.add(dispose); return dispose; },
    },
    systemPrompt: { section: () => () => {} },
    logger: { info() {}, warn() {}, error() {} },
    provide: (_key, value) => { ctx.service = value; return () => { ctx.service = null; }; },
    effect(setup) {
      const dispose = setup();
      if (typeof dispose === "function") effects.push(dispose);
      return dispose;
    },
    on(name, listener) {
      listeners.set(name, listener);
      return () => listeners.delete(name);
    },
    inject(dependencies, callback) {
      if (dependencies.includes("webServer") && ctx.webServer) callback(ctx);
    },
  };
  agent.ctx = {
    tools: {
      register(definition) {
        activeTools.add(definition.name);
        return () => activeTools.delete(definition.name);
      },
    },
    effect(setup) {
      const dispose = setup();
      return dispose;
    },
  };
  return { ctx, effects, listeners, activeTimers, activeTools, webRoutes, domain };
}

test("Host adapter cleans per-Agent tools, timers, service, and Domain on teardown", async () => {
  const global = new MemoryGlobal();
  const agent = { id: "session-a", status: "idle", session: { snapshotEvents: () => [] } };
  const harness = lifecycleContext(agent, global);
  await apply(harness.ctx, { recoveryIntervalMs: 1000, mergeWindowMs: 0 });
  assert.equal(harness.activeTools.size, 10);
  assert.ok(harness.ctx.service);
  const source = harness.ctx.service.registerSource({
    sourceId: "lark", instance: "main", displayName: "Lark", kinds: ["message.received"], filterFields: ["kinds"], capabilities: {},
  });
  assert.ok(harness.activeTimers.size > 0);
  for (const dispose of harness.effects.reverse()) await dispose();
  assert.equal(harness.activeTools.size, 0);
  assert.equal(harness.activeTimers.size, 0);
  assert.equal(harness.domain.closed, true);
  assert.equal((await source.publish(envelope("after-teardown"))).status, "rejected");
});

test("Host startup removes already expired Mail while preserving its dedup marker", async () => {
  const global = new MemoryGlobal();
  const expiredAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  global.value.mails.mail_expired = { mailId: "mail_expired", mailSeq: 1, receivedAt: expiredAt, occurredAt: expiredAt };
  global.value.deliveries.dlv_expired = {
    deliveryId: "dlv_expired", deliverySeq: 1, mailId: "mail_expired", sessionId: "session-a",
    matchedSubscriptionIds: [], state: "delivered", updatedAt: expiredAt, injectionHistory: [],
  };
  global.value.dedup[JSON.stringify(["lark", "main", "expired"])] = { mailId: "mail_expired", deliveryCount: 1, receivedAt: expiredAt };
  const agent = { id: "session-a", status: "idle", session: { snapshotEvents: () => [] } };
  const harness = lifecycleContext(agent, global);
  await apply(harness.ctx, { recoveryIntervalMs: 0 });
  try {
    assert.equal(Object.keys(global.value.mails).length, 0);
    assert.equal(Object.keys(global.value.deliveries).length, 0);
    assert.equal(Object.keys(global.value.dedup).length, 1);
    assert.equal(harness.ctx.service.sourceAdminSnapshot().overview.mails, 0);
  } finally {
    for (const dispose of harness.effects.reverse()) await dispose();
  }
});
