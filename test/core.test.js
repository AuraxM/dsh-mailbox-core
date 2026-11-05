import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore, deliveries, envelope, fakeAgent, registerLark, subscribe, waitFor } from "./helpers.js";

test("archived Sessions receive no new Delivery and lose queued backlog", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  await service.setArchivedSessions(["session-a"]);
  const archived = await source.publish(envelope("archived-new"));
  assert.equal(archived.status, "accepted");
  assert.equal(archived.deliveryCount, 0);
  assert.equal(deliveries(repository).length, 0);
  await service.setArchivedSessions([]);
  await source.publish(envelope("after-unarchive"));
  assert.equal(deliveries(repository).length, 1);
  const discarded = await service.setArchivedSessions(["session-a"]);
  assert.equal(discarded.discarded, 1);
  assert.equal(deliveries(repository).length, 0);
});

test("same source event retry is globally deduplicated", async (t) => {
  const { service, repository, global } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  const first = await source.publish(envelope("stable-event"));
  const retry = await source.publish(envelope("stable-event"));
  assert.equal(first.status, "accepted");
  assert.deepEqual(retry, { status: "duplicate", mailId: first.mailId, deliveryCount: 1 });
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 1);
  assert.equal(deliveries(repository).length, 1);
  assert.equal(global.writes, 2); // Subscription plus the single accepted publication.
});

test("concurrent retries have one accepted publication and one Delivery", async (t) => {
  const { service, repository, global } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  const results = await Promise.all([source.publish(envelope("concurrent-event")), source.publish(envelope("concurrent-event"))]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["accepted", "duplicate"]);
  assert.equal(deliveries(repository).length, 1);
  assert.equal(global.writes, 2);
});

test("one Mail fans out to two Sessions with independent Deliveries", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  await subscribe(service, "session-b");
  const result = await source.publish(envelope("fanout"));
  assert.equal(result.deliveryCount, 2);
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 1);
  assert.deepEqual(deliveries(repository).map((delivery) => delivery.sessionId).sort(), ["session-a", "session-b"]);
  assert.notEqual(deliveries(repository)[0].deliveryId, deliveries(repository)[1].deliveryId);
});

test("multiple matching Subscriptions in one Session create one Delivery with the full match snapshot", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  const broad = await subscribe(service, "session-a");
  const narrow = await subscribe(service, "session-a", { textContainsAny: ["编译"] });
  const result = await source.publish(envelope("one-session"));
  assert.equal(result.deliveryCount, 1);
  const [delivery] = deliveries(repository);
  assert.deepEqual(delivery.matchedSubscriptionIds, [broad.subscriptionId, narrow.subscriptionId].sort());
});

test("Mail without a Subscription is persisted without Delivery or wake-up", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  const agent = fakeAgent("session-a", "idle");
  service.attachAgent(agent);
  const result = await source.publish(envelope("no-subscriber"));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(result.status, "accepted");
  assert.equal(result.deliveryCount, 0);
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 1);
  assert.equal(deliveries(repository).length, 0);
  assert.equal(agent.injected.length, 0);
  assert.equal(agent.followups.length, 0);
});

test("a new Subscription does not backfill old Mail", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await source.publish(envelope("before-subscription"));
  await subscribe(service, "session-a");
  assert.equal(deliveries(repository).length, 0);
  await source.publish(envelope("after-subscription"));
  assert.equal(deliveries(repository).length, 1);
});

test("offline Delivery remains queued and flushes after Agent creation", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  await source.publish(envelope("offline"));
  assert.equal(deliveries(repository)[0].state, "queued");
  const agent = fakeAgent("session-a", "idle");
  service.attachAgent(agent);
  await waitFor(() => deliveries(repository)[0].state === "delivered", "offline recovery");
  assert.equal(agent.injected.length, 1);
  assert.equal(agent.followups.length, 1);
});

test("disabling Subscriptions stops new matches and cancels queued Delivery only when all snapshot rules are inactive", async (t) => {
  const { service, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  const broad = await subscribe(service, "session-a");
  const narrow = await subscribe(service, "session-a", { textContainsAny: ["编译"] });
  await source.publish(envelope("disable-queued"));
  await service.updateSubscription("session-a", broad.subscriptionId, { enabled: false });
  assert.equal(deliveries(repository)[0].state, "queued");
  await service.updateSubscription("session-a", narrow.subscriptionId, { enabled: false });
  assert.equal(deliveries(repository)[0].state, "cancelled");
  const next = await source.publish(envelope("disabled-new-mail"));
  assert.equal(next.deliveryCount, 0);
  assert.equal(deliveries(repository).length, 1);
});

test("expiry is equivalent to disable for future matching and queued cancellation", async (t) => {
  let now = Date.parse("2026-11-05T04:00:00Z");
  const { service, repository } = createCore({ now: () => now });
  t.after(() => service.close());
  const source = registerLark(service);
  const subscription = await service.subscribe("session-a", {
    match: { sourceId: "lark" },
    expiresAt: "2026-11-05T12:10:00+08:00",
  });
  await source.publish(envelope("expires-queued"));
  now = Date.parse("2026-11-05T04:11:00Z");
  await service.updateSubscription("session-a", subscription.subscription.subscriptionId, { enabled: true });
  assert.equal(deliveries(repository)[0].state, "cancelled");
  assert.equal((await source.publish(envelope("expires-new"))).deliveryCount, 0);
});

test("source registration is unique and dispose is idempotent", async (t) => {
  const { service } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  assert.throws(() => registerLark(service), /already registered/);
  assert.throws(() => service.registerSource({
    sourceId: "bad", instance: "main", displayName: "Bad", kinds: ["message.received"],
    filterFields: ["kind"], capabilities: {},
  }), /unsupported match field/);
  source.setStatus({ state: "connected", detail: "listening" });
  source.dispose();
  source.dispose();
  assert.throws(() => source.setStatus({ state: "connected" }), /disposed/);
  assert.deepEqual(await source.publish(envelope("disposed")), {
    status: "rejected",
    code: "SOURCE_DISPOSED",
    message: "Mailbox source is disposed",
  });
  assert.equal(service.listSources().sources.length, 0);
});

test("envelope rejects routing, prompt, wake, and processing control fields", async (t) => {
  const { service } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  for (const field of ["targetSessionId", "systemPrompt", "developerPrompt", "role", "wakeNow", "forceFollowup", "handling"]) {
    const result = await source.publish(envelope(`bad-${field}`, "text", { [field]: "not-allowed" }));
    assert.equal(result.status, "rejected");
    assert.equal(result.code, "INVALID_ENVELOPE");
  }
  const inline = await source.publish(envelope("inline-attachment", "text", {
    content: { text: "text", attachments: [{ name: "payload.txt", base64: "AAEC" }] },
  }));
  assert.equal(inline.status, "rejected");
  assert.equal(inline.code, "INVALID_ENVELOPE");
});
