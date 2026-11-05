import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore, deliveries, envelope, registerLark, subscribe, testConfig } from "./helpers.js";
import { mailboxDomainSpec } from "../lib/model.js";

test("Domain name is a storage-safe unit identifier", () => {
  // dsh-storage rejects hyphens in domain/table unit names.
  assert.match(mailboxDomainSpec.name, /^[a-z][a-z0-9_]*$/);
});

test("accepted resolves only after the complete Mail and Delivery snapshot is durable", async (t) => {
  const { service, global, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  let release;
  global.gate = new Promise((resolve) => { release = resolve; });
  let settled = false;
  const pending = source.publish(envelope("durable-accepted")).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(settled, false);
  assert.equal(deliveries(repository).length, 0);
  global.gate = null;
  release();
  const result = await pending;
  assert.equal(result.status, "accepted");
  assert.equal(global.value.deliveries && Object.keys(global.value.deliveries).length, 1);
  assert.equal(deliveries(repository).length, 1);
});

test("storage failure returns retryable and never pretends accepted", async (t) => {
  const { service, global, repository } = createCore();
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  global.failNext = true;
  const result = await source.publish(envelope("storage-failure"));
  assert.equal(result.status, "retryable");
  assert.equal(result.code, "STORAGE_UNAVAILABLE");
  assert.ok(result.retryAfterMs > 0);
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 0);
  assert.equal(deliveries(repository).length, 0);
  const retry = await source.publish(envelope("storage-failure"));
  assert.equal(retry.status, "accepted");
});

test("concurrent publish, Subscription updates, and Delivery writes serialize without lost updates", async (t) => {
  const { service, repository } = createCore({ config: testConfig({ maxMails: 100, maxDeliveries: 200 }) });
  t.after(() => service.close());
  const source = registerLark(service);
  const subscription = await subscribe(service, "session-a", { textContainsAny: ["编译", "告警"] });
  const agent = (await import("./helpers.js")).fakeAgent("session-a", "running");
  service.attachAgent(agent);
  const operations = [];
  for (let index = 0; index < 30; index += 1) {
    operations.push(source.publish(envelope(`concurrent-${index}`, index % 2 ? "告警" : "编译")));
    if (index % 5 === 0) {
      operations.push(service.updateSubscription("session-a", subscription.subscriptionId, {
        match: { sourceId: "lark", textContainsAny: index % 10 ? ["编译"] : ["编译", "告警"] },
      }));
    }
  }
  const results = await Promise.all(operations);
  assert.ok(results.every((result) => result.status === undefined || ["accepted", "duplicate"].includes(result.status)));
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 30);
  assert.equal(repository.read((state) => Object.keys(state.dedup).length), 30);
  await (await import("./helpers.js")).waitFor(() => deliveries(repository).length > 0 && deliveries(repository).every((delivery) => delivery.state === "delivered"), "concurrent deliveries");
  assert.ok(deliveries(repository).length > 0);
  assert.ok(deliveries(repository).every((delivery) => delivery.matchedSubscriptionIds.includes(subscription.subscriptionId)));
});

test("capacity prunes only settled Mail and preserves dedup tombstones", async (t) => {
  const { service, repository } = createCore({ config: testConfig({ maxMails: 2, maxDedup: 3 }) });
  t.after(() => service.close());
  const source = registerLark(service);
  const first = await source.publish(envelope("retention-1"));
  await source.publish(envelope("retention-2"));
  await source.publish(envelope("retention-3"));
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 2);
  assert.equal(repository.read((state) => Object.keys(state.dedup).length), 3);
  const duplicate = await source.publish(envelope("retention-1"));
  assert.deepEqual(duplicate, { status: "duplicate", mailId: first.mailId, deliveryCount: 0 });
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 2);
});

test("dedup pressure reclaims tombstones before otherwise healthy Mail history", async (t) => {
  const { service, repository } = createCore({ config: testConfig({ maxMails: 10, maxDedup: 2 }) });
  t.after(() => service.close());
  const source = registerLark(service);
  await source.publish(envelope("dedup-retention-1"));
  await source.publish(envelope("dedup-retention-2"));
  await source.publish(envelope("dedup-retention-3"));
  assert.deepEqual(repository.read((state) => Object.values(state.mails).map((mail) => mail.eventId).sort()), ["dedup-retention-2", "dedup-retention-3"]);
  assert.equal(repository.read((state) => Object.keys(state.dedup).length), 2);
});

test("pending work applies backpressure instead of silently dropping Mail", async (t) => {
  const { service, repository } = createCore({ config: testConfig({ maxMails: 1, maxPendingPerSession: 1 }) });
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  assert.equal((await source.publish(envelope("capacity-1"))).status, "accepted");
  const blocked = await source.publish(envelope("capacity-2"));
  assert.equal(blocked.status, "retryable");
  assert.equal(blocked.code, "SESSION_BACKPRESSURE");
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 1);
  assert.equal(deliveries(repository).length, 1);
});

test("snapshot survives repository reopen with Subscriptions and queued Deliveries", async (t) => {
  const { service, global } = createCore();
  const source = registerLark(service);
  await subscribe(service, "session-a");
  await source.publish(envelope("reopen"));
  await service.close();
  const reopened = createCore({ global });
  t.after(() => reopened.service.close());
  assert.equal(deliveries(reopened.repository).length, 1);
  assert.equal(reopened.repository.read((state) => Object.keys(state.subscriptions).length), 1);
  const duplicate = await registerLark(reopened.service).publish(envelope("reopen"));
  assert.equal(duplicate.status, "duplicate");
});
