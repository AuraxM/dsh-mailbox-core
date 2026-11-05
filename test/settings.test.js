import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createCore } from "./helpers.js";
import { MailboxRepository } from "../lib/store.js";
import { AgentMailbox } from "../lib/mailbox.js";
import { createSettingsRouter } from "../lib/settings-api.js";
import { normalizeConfig } from "../lib/config.js";
import { normalizeSourceSettings } from "../lib/source-settings.js";

const schema = {
  version: 1,
  titleI18n: { zh: "测试来源", en: "Test Source" },
  descriptionI18n: { zh: "用于设置测试", en: "Settings test source" },
  groups: [
    {
      id: "scope",
      titleI18n: { zh: "范围", en: "Scope" },
      fields: [
        { key: "enabled", type: "boolean", labelI18n: { zh: "启用", en: "Enabled" }, required: true },
        { key: "channels", type: "string-list", labelI18n: { zh: "通道", en: "Channels" }, required: true },
      ],
    },
  ],
  auth: { action: "authStatus", titleI18n: { zh: "认证", en: "Auth" }, refreshLabelI18n: { zh: "检查", en: "Check" } },
};

function validateConfig(input = {}) {
  if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("config must be object");
  const config = {
    enabled: input.enabled === true,
    channels: Array.isArray(input.channels) ? input.channels.map(String) : [],
  };
  if (config.enabled && config.channels.length === 0) throw new Error("channels are required when enabled");
  return config;
}

function register(service, options = {}) {
  const source = service.registerSource({
    sourceId: "test",
    instance: "main",
    displayName: "Test Source",
    kinds: ["message.received"],
    filterFields: ["sourceId", "conversationIds"],
    capabilities: { reply: false, threadContext: false },
    settings: schema,
    defaultConfig: { enabled: false, channels: [] },
    validateConfig,
    ...(options.validateSubscription ? { validateSubscription: options.validateSubscription } : {}),
    actions: options.actions || { authStatus: async () => ({ identities: [{ id: "test", available: true }] }) },
  });
  return source;
}

test("source settings support conditional field visibility with a known dependency", () => {
  const conditional = {
    version: 1,
    titleI18n: { zh: "来源", en: "Source" },
    groups: [{
      id: "main",
      titleI18n: { zh: "主要", en: "Main" },
      fields: [
        { key: "mode", type: "select", labelI18n: { zh: "模式", en: "Mode" }, options: [{ value: "all", labelI18n: { zh: "全部", en: "All" } }] },
        { key: "list", type: "string-list", labelI18n: { zh: "列表", en: "List" }, visibleWhen: { key: "mode", in: ["selected"] } },
      ],
    }],
  };
  const normalized = normalizeSourceSettings(conditional);
  assert.deepEqual(normalized.groups[0].fields[1].visibleWhen, { key: "mode", in: ["selected"] });
  assert.throws(
    () => normalizeSourceSettings({ ...conditional, groups: [{ ...conditional.groups[0], fields: [{ ...conditional.groups[0].fields[1], visibleWhen: { key: "missing", in: ["selected"] } }] }] }),
    /unknown field/,
  );
});

test("source settings initialize from safe defaults and persist revisions", async (t) => {
  const { service, global } = createCore();
  t.after(() => service.close());
  const source = register(service);
  assert.deepEqual(source.getConfig(), { enabled: false, channels: [] });
  let heard;
  source.onConfigChange((config) => { heard = config; });
  const result = await service.updateSourceConfig("test:main", { enabled: true, channels: ["oc_allowed"] }, 0);
  assert.equal(result.source.revision, 1);
  assert.equal(result.applyError, null);
  assert.deepEqual(heard, { enabled: true, channels: ["oc_allowed"] });
  assert.deepEqual(source.getConfig(), { enabled: true, channels: ["oc_allowed"] });
  assert.deepEqual(global.value.sourceSettings["test:main"].config, { enabled: true, channels: ["oc_allowed"] });
  const snapshot = service.sourceAdminSnapshot();
  assert.equal(snapshot.sources.length, 1);
  assert.equal(snapshot.sources[0].sourceKey, "test:main");
  assert.equal(snapshot.sources[0].revision, 1);
  assert.equal(snapshot.overview.sourceSettings, 1);

  await assert.rejects(
    () => service.updateSourceConfig("test:main", { enabled: false, channels: [] }, 0),
    (error) => error.code === "SETTINGS_REVISION_CONFLICT",
  );
  await assert.rejects(
    () => service.updateSourceConfig("test:main", { enabled: true, channels: [] }, 1),
    (error) => error.code === "INVALID_SOURCE_CONFIG",
  );
});

test("source settings survive a repository reopen", async () => {
  const first = createCore();
  const source = register(first.service);
  await first.service.updateSourceConfig("test:main", { enabled: true, channels: ["oc_saved"] }, 0);
  source.dispose();
  await first.service.close();

  const repository = new MailboxRepository({ global: first.global, now: Date.now });
  const second = new AgentMailbox({ repository, config: normalizeConfig(), now: Date.now });
  const restored = register(second);
  assert.deepEqual(restored.getConfig(), { enabled: true, channels: ["oc_saved"] });
  assert.equal(second.sourceAdminSnapshot().sources[0].revision, 1);
  await second.close();
});

test("a listener failure is surfaced without rolling back the saved config", async (t) => {
  const { service } = createCore();
  t.after(() => service.close());
  const source = register(service);
  source.onConfigChange(async () => { throw new Error("listener failed"); });
  const result = await service.updateSourceConfig("test:main", { enabled: true, channels: ["oc_a"] }, 0);
  assert.match(result.applyError, /listener failed/);
  assert.equal(result.source.config.enabled, true);
  assert.equal(result.source.status.state, "error");
});

test("source scope validates subscriptions and warns for an existing out-of-scope match", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  register(service, {
    validateSubscription(match) {
      if ((match.conversationIds || []).includes("oc_blocked")) throw new Error("conversation is outside the configured source scope");
    },
  });
  await assert.rejects(
    () => service.subscribe("session-a", { match: { sourceId: "test", conversationIds: ["oc_blocked"] } }),
    (error) => error.code === "MATCH_SCOPE_INVALID" && /outside/.test(error.message),
  );
  const valid = await service.subscribe("session-a", { match: { sourceId: "test", conversationIds: ["oc_ok"] } });
  await repository.transact((state) => {
    state.subscriptions[valid.subscription.subscriptionId].match = { sourceId: "test", conversationIds: ["oc_blocked"] };
    return { value: true };
  });
  const listed = await service.listSubscriptions("session-a", {});
  assert.match(listed.subscriptions[0].scopeWarning, /outside/);
});

test("source actions are bounded and unknown actions are rejected", async (t) => {
  const { service } = createCore();
  t.after(() => service.close());
  register(service);
  assert.deepEqual(await service.invokeSourceAction("test:main", "authStatus"), { identities: [{ id: "test", available: true }] });
  await assert.rejects(
    () => service.invokeSourceAction("test:main", "missing"),
    (error) => error.code === "SOURCE_ACTION_NOT_FOUND",
  );
  await assert.rejects(
    () => service.invokeSourceAction("missing:main", "authStatus"),
    (error) => error.code === "SOURCE_NOT_FOUND",
  );
});

function callRoute(router, { method = "GET", path = "/api/state", remote = "127.0.0.1", body } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.method = method;
    req.url = path;
    req.socket = { remoteAddress: remote };
    const res = {
      statusCode: 0,
      headers: undefined,
      writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
      end(chunk) {
        try {
          resolve({ status: this.statusCode, body: chunk ? JSON.parse(String(chunk)) : null });
        } catch (error) {
          reject(error);
        }
      },
    };
    router.handle(req, res).catch(reject);
  });
}

test("Settings HTTP API is loopback-gated for writes and returns source schemas", async (t) => {
  const { service } = createCore();
  t.after(() => service.close());
  register(service);
  const router = createSettingsRouter({ service });
  const state = await callRoute(router);
  assert.equal(state.status, 200);
  assert.equal(state.body.ok, true);
  assert.equal(state.body.sources[0].sourceKey, "test:main");
  assert.equal(state.body.sources[0].settings.groups[0].fields[0].key, "enabled");

  const forbidden = await callRoute(router, {
    method: "POST",
    path: "/api/config",
    remote: "10.0.0.7",
    body: { sourceKey: "test:main", config: { enabled: true, channels: ["oc_a"] }, expectedRevision: 0 },
  });
  assert.equal(forbidden.status, 403);

  const saved = await callRoute(router, {
    method: "POST",
    path: "/api/config",
    body: { sourceKey: "test:main", config: { enabled: true, channels: ["oc_a"] }, expectedRevision: 0 },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.source.revision, 1);

  const action = await callRoute(router, {
    method: "POST",
    path: "/api/action",
    body: { sourceKey: "test:main", action: "authStatus", input: {} },
  });
  assert.equal(action.status, 200);
  assert.deepEqual(action.body.result, { identities: [{ id: "test", available: true }] });
});
