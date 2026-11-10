import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore, deliveries, envelope, subscribe, waitFor } from "./helpers.js";
import { FilterExecutionError, PtcFilterRuntime } from "../lib/filter-runtime.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class LocalFilterRuntime {
  constructor() {
    this.available = true;
    this.calls = 0;
    this.gate = null;
  }

  async execute(filter, mail) {
    this.calls += 1;
    if (this.gate) await this.gate;
    const fn = await AsyncFunction("mail", `return (${filter.source})`)(mail);
    const value = await fn(mail);
    if (typeof value !== "boolean") throw new FilterExecutionError("FILTER_EXECUTION_FAILED", "Mailbox filter must return a boolean", { phase: "invalid-return" });
    return { value, durationMs: 1 };
  }

  async close() {}
}

function filter(source) {
  return { version: 1, language: "javascript", source };
}

function registerFilterSource(service, validateSubscription) {
  return service.registerSource({
    sourceId: "lark",
    instance: "main",
    displayName: "Lark",
    kinds: ["message.received"],
    filterFields: ["sourceId", "sourceInstance", "kinds", "conversationIds", "threadIds", "textContainsAny"],
    capabilities: { reply: false, threadContext: false, javascriptFilter: true },
    ...(validateSubscription ? { validateSubscription } : {}),
    javascriptFilter: {
      reference: {
        facts: [{ path: "facts.stateId", label: "State id" }],
        templates: [{ id: "state", title: "State", source: "mail => mail.facts.stateId === 'next'" }],
      },
      testEvent(match) {
        return {
          kind: match.kinds?.[0] || "message.received",
          actor: { externalId: "test-actor", displayName: "Test actor" },
          conversation: { externalId: "chat-id", threadId: "thread-id" },
          content: { text: "Synthetic event", attachments: [] },
          facts: { stateId: "next", assigneeId: "test-assignee" },
        };
      },
      async resolveValues(input) {
        return { items: [{ value: "next", label: "Next", description: input.field }], nextCursor: null };
      },
    },
  });
}

test("subscribe and update run a synthetic event before saving JavaScript", async (t) => {
  const runtime = new LocalFilterRuntime();
  const { service, global } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  registerFilterSource(service);
  const created = await service.subscribe("session-a", {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => mail.facts.stateId === 'next'") },
  });
  assert.equal(created.filterCheck.status, "passed");
  assert.equal(created.filterCheck.returned, true);
  assert.equal(created.filterCheck.synthetic, true);
  assert.equal(created.subscription.revision, 1);
  assert.equal(runtime.calls, 1);
  await assert.rejects(() => service.updateSubscription("session-b", created.subscription.subscriptionId, {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => true") },
  }), /current Session/);
  assert.equal(runtime.calls, 1, "ownership is checked before executing an update test");

  const before = created.subscription.match.filter.source;
  await assert.rejects(() => service.updateSubscription("session-a", created.subscription.subscriptionId, {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => mail.facts.missing.deep") },
  }), (error) => error.code === "FILTER_TEST_FAILED");
  const listed = await service.listSubscriptions("session-a", {});
  assert.equal(listed.subscriptions[0].match.filter.source, before);
  assert.equal(listed.subscriptions[0].revision, 1);
  assert.equal(Object.keys(global.value.subscriptions).length, 1);

  await assert.rejects(() => service.subscribe("session-a", {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => 'not boolean'") },
  }), (error) => error.code === "FILTER_TEST_FAILED");
  assert.equal(Object.keys(global.value.subscriptions).length, 1);
});

test("JavaScript filters match facts and threadIds after static prefiltering", async (t) => {
  const runtime = new LocalFilterRuntime();
  const { service, repository } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  const source = registerFilterSource(service);
  await service.subscribe("session-a", {
    match: {
      sourceId: "lark", sourceInstance: "main", threadIds: ["thread-id"],
      filter: filter("mail => mail.facts.stateId === 'next' && mail.facts.assigneeId === 'user-1'"),
    },
  });
  const before = runtime.calls;
  const miss = await source.publish(envelope("filter-miss", "text", { facts: { stateId: "previous", assigneeId: "user-1" } }));
  assert.equal(miss.deliveryCount, 0);
  const hit = await source.publish(envelope("filter-hit", "text", { facts: { stateId: "next", assigneeId: "user-1" } }));
  assert.equal(hit.deliveryCount, 1);
  const threadMiss = await source.publish(envelope("filter-thread", "text", {
    conversation: { externalId: "chat-id", threadId: "other-thread" },
    facts: { stateId: "next", assigneeId: "user-1" },
  }));
  assert.equal(threadMiss.deliveryCount, 0);
  assert.equal(runtime.calls, before + 2, "static thread miss does not execute JavaScript");
  assert.equal(deliveries(repository).length, 1);
  assert.equal(repository.read((state) => Object.values(state.mails).find((mail) => mail.eventId === "filter-hit").facts.assigneeId), "user-1");
});

test("a real-event exception fails closed without blocking another Subscription", async (t) => {
  const runtime = new LocalFilterRuntime();
  const { service, repository } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  const source = registerFilterSource(service);
  const broad = await subscribe(service, "session-a");
  await service.subscribe("session-a", {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => mail.eventId === 'real-error' ? mail.facts.missing.deep : true") },
  });
  const result = await source.publish(envelope("real-error", "text", { facts: {} }));
  assert.equal(result.deliveryCount, 1);
  assert.deepEqual(deliveries(repository)[0].matchedSubscriptionIds, [broad.subscriptionId]);
  const listed = await service.listSubscriptions("session-a", {});
  assert.match(listed.subscriptions.find((row) => row.match.filter).filterWarning, /FILTER_EXECUTION_FAILED/);
});

test("filter runtime absence is explicit and an existing filter retries publication", async (t) => {
  const runtime = new LocalFilterRuntime();
  const { service } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  const source = registerFilterSource(service);
  await service.subscribe("session-a", {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => true") },
  });
  service.filterRuntime = null;
  const result = await source.publish(envelope("runtime-offline"));
  assert.equal(result.status, "retryable");
  assert.equal(result.code, "FILTER_RUNTIME_UNAVAILABLE");
  await assert.rejects(() => service.subscribe("session-b", {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => true") },
  }), (error) => error.code === "FILTER_RUNTIME_UNAVAILABLE");
});

test("subscription revision invalidates an in-flight filter result", async (t) => {
  const runtime = new LocalFilterRuntime();
  const { service, repository } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  const source = registerFilterSource(service);
  const created = await service.subscribe("session-a", {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => true") },
  });
  let release;
  runtime.gate = new Promise((resolve) => { release = resolve; });
  const before = runtime.calls;
  const publishing = source.publish(envelope("revision-race"));
  await waitFor(() => runtime.calls > before, "filter started");
  await service.updateSubscription("session-a", created.subscription.subscriptionId, { enabled: false });
  release();
  const result = await publishing;
  assert.equal(result.status, "accepted");
  assert.equal(result.deliveryCount, 0);
  assert.equal(deliveries(repository).length, 0);
});

test("an active filter revision change retries instead of committing a stale result", async (t) => {
  const runtime = new LocalFilterRuntime();
  const { service, global } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  const source = registerFilterSource(service);
  const created = await service.subscribe("session-a", {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => true") },
  });
  let release;
  runtime.gate = new Promise((resolve) => { release = resolve; });
  const before = runtime.calls;
  const publishing = source.publish(envelope("active-revision-race"));
  await waitFor(() => runtime.calls > before, "old filter started");
  runtime.gate = null;
  await service.updateSubscription("session-a", created.subscription.subscriptionId, {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => false") },
  });
  release();
  const stale = await publishing;
  assert.equal(stale.status, "retryable");
  assert.equal(stale.code, "FILTER_REVISION_CHANGED");
  assert.equal(Object.keys(global.value.mails).length, 0);
  const replay = await source.publish(envelope("active-revision-race"));
  assert.equal(replay.status, "accepted");
  assert.equal(replay.deliveryCount, 0);
  assert.equal(Object.keys(global.value.mails).length, 0);
});

test("a stale asynchronous error cannot warn a newer filter revision", async (t) => {
  const runtime = new LocalFilterRuntime();
  const { service } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  const source = registerFilterSource(service);
  const created = await service.subscribe("session-a", {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => mail.eventId === 'old-error' ? (() => { throw new Error('old source failed') })() : true") },
  });
  let release;
  runtime.gate = new Promise((resolve) => { release = resolve; });
  const before = runtime.calls;
  const publishing = source.publish(envelope("old-error"));
  await waitFor(() => runtime.calls > before, "old failing filter started");
  runtime.gate = null;
  await service.updateSubscription("session-a", created.subscription.subscriptionId, {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => true") },
  });
  release();
  assert.equal((await publishing).code, "FILTER_REVISION_CHANGED");
  const listed = await service.listSubscriptions("session-a", {});
  assert.equal(listed.subscriptions[0].revision, 2);
  assert.equal(listed.subscriptions[0].filterWarning, null);
});

test("a failed Subscription storage commit preserves the previous filter warning", async (t) => {
  const runtime = new LocalFilterRuntime();
  const { service, global } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  const source = registerFilterSource(service);
  const created = await service.subscribe("session-a", {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => mail.eventId === 'warning-event' ? (() => { throw new Error('visible failure') })() : true") },
  });
  await source.publish(envelope("warning-event"));
  assert.match((await service.listSubscriptions("session-a", {})).subscriptions[0].filterWarning, /visible failure/);
  global.failNext = true;
  await assert.rejects(() => service.updateSubscription("session-a", created.subscription.subscriptionId, {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => true") },
  }), /injected storage failure/);
  assert.match((await service.listSubscriptions("session-a", {})).subscriptions[0].filterWarning, /visible failure/);
});

test("identical filters share one execution and still fan out by Subscription", async (t) => {
  const runtime = new LocalFilterRuntime();
  const { service, repository } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  const source = registerFilterSource(service);
  const match = { sourceId: "lark", sourceInstance: "main", filter: filter("mail => true") };
  await service.subscribe("session-a", { match });
  await service.subscribe("session-a", { match });
  const before = runtime.calls;
  const result = await source.publish(envelope("shared-filter"));
  assert.equal(result.deliveryCount, 1);
  assert.equal(runtime.calls, before + 1);
  assert.equal(deliveries(repository)[0].matchedSubscriptionIds.length, 2);
});

test("reference, values and real-Delivery test are bounded and Session scoped", async (t) => {
  const runtime = new LocalFilterRuntime();
  const { service, repository } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  const source = registerFilterSource(service);
  assert.equal(service.filterReference({ sourceId: "lark", sourceInstance: "main" }).reference.facts[0].path, "facts.stateId");
  assert.deepEqual(await service.filterValues({ sourceId: "lark", sourceInstance: "main", field: "facts.stateId", limit: 1 }), {
    items: [{ value: "next", label: "Next", description: "facts.stateId" }], nextCursor: null,
  });
  await subscribe(service, "session-a");
  await source.publish(envelope("test-delivery"));
  const deliveryId = deliveries(repository)[0].deliveryId;
  const tested = await service.testFilter("session-a", { filter: filter("mail => mail.eventId === 'test-delivery'"), deliveryId });
  assert.deepEqual({ ok: tested.ok, matched: tested.matched, synthetic: tested.synthetic }, { ok: true, matched: true, synthetic: false });
  await repository.transact((state) => {
    const mail = Object.values(state.mails)[0];
    delete mail.facts;
    delete mail.conversation.threadId;
    return { value: true };
  });
  const legacy = await service.testFilter("session-a", { filter: filter("mail => mail.conversation.threadId === null && mail.facts.ok === true"), deliveryId });
  assert.deepEqual({ ok: legacy.ok, matched: legacy.matched }, { ok: true, matched: false });
  const denied = await service.testFilter("session-b", { filter: filter("mail => true"), deliveryId });
  assert.equal(denied.ok, false);
  assert.match(denied.error.message, /current Session/);
});

test("dynamic values cannot escape the source conversation scope", async (t) => {
  const runtime = new LocalFilterRuntime();
  const { service } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  registerFilterSource(service, (match) => {
    if (match.conversationIds?.includes("blocked")) throw new Error("outside configured scope");
  });
  await assert.rejects(() => service.filterValues({
    sourceId: "lark", sourceInstance: "main", field: "facts.stateId", conversationId: "blocked",
  }), (error) => error.code === "MATCH_SCOPE_INVALID" && /outside/.test(error.message));
});

test("PTC adapter uses an empty binding set, read-only policy and strict boolean output", async (t) => {
  const requests = [];
  const ptcRuntime = {
    language: "typescript",
    programFormat: "function-body",
    resolve(request) {
      requests.push(request);
      return request;
    },
    async run(spec) {
      try {
        const value = await AsyncFunction(spec.program)();
        return { value, logs: [] };
      } catch (error) {
        return { logs: [], error: { kind: "exception", message: error.message } };
      }
    },
  };
  const runtime = await PtcFilterRuntime.open({ ptcRuntime, timeoutMs: 500 });
  t.after(() => runtime.close());
  const result = await runtime.execute(filter("mail => mail.facts.ok"), { eventId: "ptc", facts: { ok: true } });
  assert.equal(result.value, true);
  assert.equal(requests[0].bindings.length, 0);
  assert.equal(requests[0].sandboxPolicy.mode, "read-only");
  assert.equal(requests[0].timeoutMs, 500);
  assert.equal(requests[0].stateOwner, undefined);
  await assert.rejects(() => runtime.execute(filter("mail => 1"), { facts: {} }), (error) => error.code === "FILTER_EXECUTION_FAILED");
  await runtime.close();
  await assert.rejects(() => runtime.execute(filter("mail => true"), { facts: {} }), (error) => error.code === "FILTER_RUNTIME_UNAVAILABLE");
});

test("PTC close aborts and awaits an active filter before removing its workspace", async () => {
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  let settled = false;
  const ptcRuntime = {
    language: "typescript",
    programFormat: "function-body",
    resolve: (request) => request,
    async run(spec) {
      markStarted();
      return new Promise((resolve) => {
        spec.signal.addEventListener("abort", () => {
          settled = true;
          resolve({ logs: [], error: { kind: "abort", message: "closing" } });
        }, { once: true });
      });
    },
  };
  const runtime = await PtcFilterRuntime.open({ ptcRuntime, timeoutMs: 5000 });
  const executing = runtime.execute(filter("mail => true"), { facts: {} }).catch((error) => error);
  await started;
  const firstClose = runtime.close();
  const secondClose = runtime.close();
  assert.strictEqual(secondClose, firstClose);
  await Promise.all([firstClose, secondClose]);
  const outcome = await executing;
  assert.equal(settled, true);
  assert.equal(outcome.code, "FILTER_RUNTIME_UNAVAILABLE");
  assert.equal(runtime.pending.size, 0);
});

test("PTC adapter discovers a later TypeScript provider and rejects other languages", async () => {
  let current = null;
  const runtime = await PtcFilterRuntime.open({ getPtcRuntime: () => current });
  assert.equal(runtime.available, false);
  current = { language: "python" };
  assert.equal(runtime.available, false);
  current = {
    language: "typescript",
    programFormat: "function-body",
    resolve: (request) => request,
    run: async () => ({ value: true, logs: [] }),
  };
  assert.equal(runtime.available, true);
  assert.equal((await runtime.execute(filter("mail => true"), { facts: {} })).value, true);
  await runtime.close();
});

test("a deterministic protocol failure closes the filter instead of blocking publication", async (t) => {
  let failureKind = null;
  const runtime = await PtcFilterRuntime.open({
    ptcRuntime: {
      language: "typescript",
      programFormat: "function-body",
      resolve: (request) => request,
      async run() {
        return failureKind
          ? { logs: [], error: { kind: failureKind, message: "guest disrupted its runtime" } }
          : { value: true, logs: [] };
      },
    },
  });
  const { service } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  const source = registerFilterSource(service);
  await service.subscribe("session-a", {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => true") },
  });
  failureKind = "protocol";
  const result = await source.publish(envelope("failure-protocol"));
  assert.equal(result.status, "accepted");
  assert.equal(result.deliveryCount, 0);
  assert.equal(deliveries(service.repository).length, 0);
  const listed = await service.listSubscriptions("session-a", {});
  assert.match(listed.subscriptions[0].filterWarning, /FILTER_EXECUTION_FAILED/);
});

test("provider abort and worker-exit are retryable without committing Mail or dedup", async (t) => {
  let failureKind = null;
  const runtime = await PtcFilterRuntime.open({
    ptcRuntime: {
      language: "typescript",
      programFormat: "function-body",
      resolve: (request) => request,
      async run() {
        return failureKind
          ? { logs: [], error: { kind: failureKind, message: "provider execution substrate is unavailable" } }
          : { value: true, logs: [] };
      },
    },
  });
  const { service, global } = createCore({ filterRuntime: runtime });
  t.after(() => service.close());
  const source = registerFilterSource(service);
  await service.subscribe("session-a", {
    match: { sourceId: "lark", sourceInstance: "main", filter: filter("mail => true") },
  });
  for (const kind of ["abort", "worker-exit"]) {
    failureKind = kind;
    const result = await source.publish(envelope(`provider-${kind}`));
    assert.equal(result.status, "retryable");
    assert.equal(result.code, "FILTER_RUNTIME_UNAVAILABLE");
  }
  assert.equal(Object.keys(global.value.mails).length, 0);
  assert.equal(Object.keys(global.value.dedup).length, 0);
});

test("script and REPL PTC formats use a final IIFE instead of top-level return", async () => {
  for (const programFormat of ["script", "repl"]) {
    const runtime = await PtcFilterRuntime.open({
      ptcRuntime: {
        language: "typescript",
        programFormat,
        resolve: (request) => request,
        async run(spec) {
          assert.match(spec.program, /^\(async \(\) =>/);
          assert.doesNotMatch(spec.program, /^return /);
          const value = await AsyncFunction(`return await (${spec.program})`)();
          return { value, logs: [] };
        },
      },
    });
    assert.equal((await runtime.execute(filter("mail => mail.facts.ok"), { facts: { ok: true } })).value, true);
    await runtime.close();
  }
});

test("AgentMailbox close shares one completion across concurrent callers", async () => {
  let finishRuntimeClose;
  const runtime = {
    available: true,
    close: () => new Promise((resolve) => { finishRuntimeClose = resolve; }),
  };
  const { service, global } = createCore({ filterRuntime: runtime });
  const first = service.close();
  const second = service.close();
  assert.strictEqual(second, first);
  await new Promise((resolve) => setImmediate(resolve));
  finishRuntimeClose();
  await Promise.all([first, second]);
  assert.equal(global.value.version, 1);
});

test("AgentMailbox still closes its Domain when filter runtime cleanup fails", async () => {
  let repositoryCloseCount = 0;
  const runtime = {
    available: true,
    close: async () => { throw new Error("injected filter cleanup failure"); },
  };
  const { service } = createCore({ filterRuntime: runtime });
  service.repository.close = async () => { repositoryCloseCount += 1; };
  await assert.rejects(() => service.close(), /injected filter cleanup failure/);
  assert.equal(repositoryCloseCount, 1);
});
