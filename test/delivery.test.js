import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore, deliveries, envelope, fakeAgent, MemoryGlobal, registerLark, subscribe, testConfig, waitFor } from "./helpers.js";
import { AgentMailbox } from "../lib/mailbox.js";
import { MailboxRepository } from "../lib/store.js";

test("running Agent receives continuous inject without followup or a second Loop", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  const agent = fakeAgent("session-a", "running");
  service.attachAgent(agent);
  await source.publish(envelope("running-1", "first"));
  await waitFor(() => agent.injected.length === 1, "first running injection");
  await source.publish(envelope("running-2", "second"));
  await waitFor(() => agent.injected.length === 2, "second running injection");
  assert.equal(agent.followups.length, 0);
  assert.equal(deliveries(repository).length, 2);
  assert.ok(deliveries(repository).every((delivery) => delivery.state === "delivered"));
  assert.notEqual(agent.injected[0].source.batchId, agent.injected[1].source.batchId);
});

test("one batch groups deliveries by collapseKey without dropping any deliveryId", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  await source.publish(envelope("collapse-1", "first"));
  await source.publish(envelope("collapse-2", "second"));
  const agent = fakeAgent("session-a", "running");
  service.attachAgent(agent);
  await waitFor(() => deliveries(repository).every((delivery) => delivery.state === "delivered"), "collapsed delivery");
  assert.equal(agent.injected.length, 1);
  const lines = agent.injected[0].content[0].text.split("\n");
  const group = JSON.parse(lines[2]);
  assert.equal(group.collapseKey, "lark:chat-id:thread-id");
  assert.equal(group.deliveries.length, 2);
  assert.deepEqual(group.deliveries.map((item) => item.contentPreview.text), ["first", "second"]);
});

test("idle Agent receives the batch through inject and exactly one followup wake", async (t) => {
  let flushed = 0;
  const { service, repository } = createCore({
    flush: async (session) => {
      flushed += 1;
      assert.ok(session);
      assert.ok(deliveries(repository).every((delivery) => delivery.state === "queued"));
      return true;
    },
  });
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  const agent = fakeAgent("session-a", "idle");
  service.attachAgent(agent);
  await source.publish(envelope("idle-wake"));
  await waitFor(() => deliveries(repository)[0]?.state === "delivered", "idle delivery");
  assert.equal(agent.injected.length, 1);
  assert.equal(agent.followups.length, 1);
  assert.equal(flushed, 1);
  assert.equal(agent.injected[0].source.form, "mailbox-batch");
  assert.equal(agent.followups[0].source.form, "mailbox-wake");
  assert.equal(agent.injected[0].source.batchId, agent.followups[0].source.batchId);
});

test("defer schedules the same Delivery again and preserves explicit time and injection history", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  const agent = fakeAgent("session-a", "idle");
  service.attachAgent(agent);
  await source.publish(envelope("defer-me"));
  await waitFor(() => deliveries(repository)[0]?.state === "delivered", "initial delivery");
  const first = deliveries(repository)[0];
  const until = new Date(Date.now() + 45).toISOString();
  await service.defer("session-a", { deliveryId: first.deliveryId, until });
  assert.equal(deliveries(repository)[0].state, "deferred");
  assert.equal(deliveries(repository)[0].deferUntil, until);
  assert.equal(agent.injected.length, 1);
  await waitFor(() => deliveries(repository)[0].injectionCount === 2, "deferred reminder");
  const delivered = deliveries(repository)[0];
  assert.equal(delivered.state, "delivered");
  assert.equal(delivered.injectedBatchIds.length, 2);
  assert.equal(delivered.injectionHistory.length, 2);
  assert.equal(delivered.deliveredAt, first.deliveredAt);
  assert.equal(delivered.deferUntil, null);
  assert.equal(agent.injected.length, 2);
});

test("history and get are isolated to the current Session", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  await subscribe(service, "session-b");
  await source.publish(envelope("private-history", "secret text"));
  const [a, b] = deliveries(repository);
  const aHistory = service.history("session-a", { states: ["queued"] });
  const bHistory = service.history("session-b", { states: ["queued"] });
  assert.deepEqual(aHistory.deliveries.map((item) => item.deliveryId), [a.deliveryId]);
  assert.deepEqual(bHistory.deliveries.map((item) => item.deliveryId), [b.deliveryId]);
  assert.equal(service.history("session-a").deliveries.length, 0);
  assert.equal(service.get("session-a", { deliveryId: a.deliveryId }).mail.content.text, "secret text");
  assert.throws(() => service.get("session-a", { deliveryId: b.deliveryId }), /current Session/);
  await assert.rejects(() => service.defer("session-a", { deliveryId: b.deliveryId, until: new Date(Date.now() + 10000).toISOString() }), /current Session/);
});

test("Mail and Delivery carry occurred, received, created, delivered, and per-injection times", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  const agent = fakeAgent("session-a", "running");
  service.attachAgent(agent);
  await source.publish(envelope("time-fields"));
  await waitFor(() => deliveries(repository)[0]?.state === "delivered", "timed delivery");
  const state = repository.snapshot();
  const delivery = deliveries(repository)[0];
  const mail = state.mails[delivery.mailId];
  assert.equal(mail.occurredAt, "2026-11-05T04:20:00.000Z");
  for (const value of [mail.receivedAt, delivery.createdAt, delivery.updatedAt, delivery.deliveredAt]) {
    assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  }
  assert.equal(delivery.injectionHistory.length, 1);
  assert.ok(delivery.injectionHistory[0].createdAt);
  assert.ok(delivery.injectionHistory[0].injectedAt);
  assert.ok(delivery.injectionHistory[0].eventSeq);
});

test("running delivery that is still unclaimed gets one followup after the Agent becomes idle", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  const agent = fakeAgent("session-a", "running");
  service.attachAgent(agent);
  await source.publish(envelope("running-then-idle"));
  await waitFor(() => deliveries(repository)[0]?.state === "delivered", "running delivery");
  assert.equal(agent.injected.length, 1);
  assert.equal(agent.followups.length, 0);

  agent.setStatus("idle");
  await waitFor(() => agent.followups.length === 1, "idle recovery followup");
  assert.equal(agent.followups[0].source.form, "mailbox-wake");
  assert.equal(agent.followups[0].source.batchId, agent.injected[0].source.batchId);

  agent.admitMailboxBatches();
  agent.setStatus("idle");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(agent.followups.length, 1, "admitted batch is not woken twice");
  assert.equal(deliveries(repository)[0].state, "delivered");
});

test("a Subscription disable cannot cancel an in-flight injected batch", async (t) => {
  let releaseFlush;
  const flushGate = new Promise((resolve) => { releaseFlush = resolve; });
  const { service, repository } = createCore({ flush: async () => { await flushGate; return true; } });
  t.after(() => service.close());
  const source = registerLark(service);
  const subscription = await subscribe(service, "session-a");
  const agent = fakeAgent("session-a", "running");
  service.attachAgent(agent);
  await source.publish(envelope("disable-during-inject"));
  await waitFor(() => agent.injected.length === 1 &&
    repository.read((state) => Object.values(state.batches)[0]?.state === "injecting"), "in-flight batch");
  const delivery = deliveries(repository)[0];
  await service.updateSubscription("session-a", subscription.subscriptionId, { enabled: false });
  assert.equal(deliveries(repository)[0].state, "queued", "in-flight Delivery is not cancelled");
  assert.equal(repository.read((state) => state.batches[delivery.injectedBatchIds[0] || Object.keys(state.batches)[0]]?.state), "injecting");
  releaseFlush();
  await waitFor(() => deliveries(repository)[0].state === "delivered", "in-flight delivery completion");
  assert.equal(deliveries(repository)[0].state, "delivered");
});

test("a followup failure after successful inject recovers through log reconciliation", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  const agent = fakeAgent("session-a", "idle");
  const originalFollowup = agent.followup.bind(agent);
  let failOnce = true;
  agent.followup = (message) => {
    if (failOnce) {
      failOnce = false;
      throw new Error("simulated followup failure");
    }
    return originalFollowup(message);
  };
  service.attachAgent(agent);
  await source.publish(envelope("followup-failure"));
  await waitFor(() => deliveries(repository)[0]?.state === "delivered" && agent.followups.length === 1, "followup recovery");
  const delivery = deliveries(repository)[0];
  assert.equal(delivery.state, "delivered");
  assert.equal(delivery.injectionCount, 1);
  assert.equal(delivery.attempts, 1);
  assert.equal(delivery.lastError, null);
});

test("a crash after persisting injecting but before inject rolls back to planned and retries", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  await source.publish(envelope("crash-before-inject"));
  const batch = await service.scheduler.prepareBatch("session-a");
  await repository.transact((state) => {
    state.batches[batch.batchId].state = "injecting";
    state.batches[batch.batchId].injectStartedAt = new Date().toISOString();
    return { value: true };
  });
  const agent = fakeAgent("session-a", "idle");
  service.attachAgent(agent);
  await waitFor(() => deliveries(repository)[0]?.state === "delivered", "stale lease recovery");
  assert.equal(agent.injected.length, 1);
  assert.equal(agent.followups.length, 1);
  assert.equal(deliveries(repository)[0].lastError, null);
});

test("inject failures are bounded by maxInjectAttempts instead of retrying forever", async (t) => {
  const { service, repository } = createCore({ config: testConfig({ maxInjectAttempts: 2, retryBaseMs: 1 }) });
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  const agent = fakeAgent("session-a", "idle");
  agent.inject = () => { throw new Error("simulated inject failure"); };
  service.attachAgent(agent);
  await source.publish(envelope("bounded-inject"));
  await waitFor(() => deliveries(repository)[0]?.state === "dead-letter", "bounded injection failure");
  const delivery = deliveries(repository)[0];
  assert.equal(delivery.attempts, 2);
  assert.match(delivery.lastError, /simulated inject failure/);
  assert.ok(Object.values(repository.snapshot().batches).every((batch) => batch.state === "cancelled"));
});

test("serialized inbox and user/message evidence reconciles a crash without duplicate injection", async (t) => {
  const global = new MemoryGlobal();
  let failFlush = true;
  const config = testConfig();
  const firstRepository = new MailboxRepository({ global, now: Date.now });
  const first = new AgentMailbox({
    repository: firstRepository,
    config,
    flush: async () => {
      if (failFlush) throw new Error("simulated crash before checkpoint");
      return true;
    },
  });
  const source = registerLark(first);
  await subscribe(first, "session-a");
  const agent = fakeAgent("session-a", "running");
  first.attachAgent(agent);
  await source.publish(envelope("crash-window"));
  await waitFor(() => agent.injected.length === 1 && firstRepository.read((state) => Object.keys(state.batches).length === 1), "uncheckpointed injection");
  await waitFor(() => firstRepository.read((state) => Object.values(state.batches)[0]?.state === "injecting"), "in-flight checkpoint recovery state");
  assert.equal(deliveries(firstRepository)[0].state, "queued");
  assert.equal(deliveries(firstRepository)[0].lastError, null);
  const batchId = agent.injected[0].source.batchId;
  agent.admitMailboxBatches(); // Also prove the ordinary user/message recovery path survives JSON serialization.
  failFlush = false;
  await first.scheduler.close();

  const secondRepository = new MailboxRepository({ global, now: Date.now });
  const second = new AgentMailbox({ repository: secondRepository, config, flush: async () => true });
  t.after(() => second.close());
  second.attachAgent(agent);
  await waitFor(() => deliveries(secondRepository)[0].state === "delivered", "log reconciliation");
  assert.equal(agent.injected.length, 1);
  assert.equal(deliveries(secondRepository)[0].injectedBatchIds[0], batchId);
  const evidence = JSON.parse(JSON.stringify(agent.session.events));
  assert.ok(evidence.some((event) => event.type === "agent/inbox/spliced" && event.data.inserted[0]?.source.batchId === batchId));
  assert.ok(evidence.some((event) => event.type === "user/message" && event.data.source.deliveryIds.length === 1));
});
