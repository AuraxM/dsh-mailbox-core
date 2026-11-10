import assert from "node:assert/strict";
import { test } from "node:test";
import { createCore, deliveries, envelope, fakeAgent, registerLark, subscribe, testConfig, waitFor } from "./helpers.js";

const START = Date.parse("2026-11-05T04:00:00Z");

async function markDelivered(repository, sessionId, nowMs) {
  await repository.transact((state) => {
    for (const delivery of Object.values(state.deliveries)) {
      if (delivery.sessionId !== sessionId || delivery.state === "delivered") continue;
      delivery.state = "delivered";
      delivery.deliveredAt = new Date(nowMs).toISOString();
      delivery.updatedAt = new Date(nowMs).toISOString();
      delivery.deferUntil = null;
    }
    return { value: true };
  });
}

test("queued Mail survives expiry and delivered Mail remains readable for the full retention window", async (t) => {
  let now = START;
  const { service, repository } = createCore({
    now: () => now,
    config: testConfig({ mailRetentionMs: 1000, retentionSweepIntervalMs: 0 }),
  });
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  const published = await source.publish(envelope("retention-window", "full text"));

  now += 5000;
  assert.equal(await service.pruneExpired(), 0);
  assert.equal(deliveries(repository)[0].state, "queued");

  const agent = fakeAgent("session-a", "running");
  service.attachAgent(agent);
  await waitFor(() => deliveries(repository)[0]?.state === "delivered", "retention test delivery");
  const deliveryId = deliveries(repository)[0].deliveryId;
  now += 999;
  assert.equal(await service.pruneExpired(), 0);
  assert.equal(service.history("session-a").deliveries.length, 1);
  assert.equal(service.get("session-a", { deliveryId }).mail.content.text, "full text");

  now += 1;
  assert.equal(await service.pruneExpired(), 1);
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 0);
  assert.equal(deliveries(repository).length, 0);
  assert.equal(service.history("session-a").deliveries.length, 0);
  assert.deepEqual(await source.publish(envelope("retention-window", "full text")), {
    status: "duplicate", mailId: published.mailId, deliveryCount: 1,
  });
  assert.equal(repository.read((state) => Object.keys(state.dedup).length), 1);
});

test("retention waits for every Delivery and never expires deferred work", async (t) => {
  let now = START;
  const { service, repository } = createCore({
    now: () => now,
    config: testConfig({ mailRetentionMs: 1000, retentionSweepIntervalMs: 0 }),
  });
  t.after(() => service.close());
  const source = registerLark(service);
  await subscribe(service, "session-a");
  await subscribe(service, "session-b");
  await source.publish(envelope("fanout-retention"));
  await markDelivered(repository, "session-a", now);

  now += 1001;
  assert.equal(await service.pruneExpired(), 0);
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 1);
  await markDelivered(repository, "session-b", now);
  const second = deliveries(repository).find((delivery) => delivery.sessionId === "session-b");
  await service.defer("session-b", { deliveryId: second.deliveryId, until: new Date(now + 5000).toISOString() });

  now += 2000;
  assert.equal(await service.pruneExpired(), 0);
  assert.equal(deliveries(repository).find((delivery) => delivery.sessionId === "session-b").state, "deferred");
  await markDelivered(repository, "session-b", now);
  now += 999;
  assert.equal(await service.pruneExpired(), 0);
  now += 1;
  assert.equal(await service.pruneExpired(), 1);
  assert.equal(deliveries(repository).length, 0);
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 0);
});

test("the retention timer removes expired Mail and is disposed with the service", async (t) => {
  let now = START;
  let sweep;
  let timerDisposed = false;
  const timer = {
    timeout() { return () => {}; },
    interval(callback, delay) {
      assert.equal(delay, 25);
      sweep = callback;
      return () => { timerDisposed = true; };
    },
  };
  const { service, repository } = createCore({
    now: () => now,
    timer,
    config: testConfig({ mailRetentionMs: 1000, retentionSweepIntervalMs: 25 }),
  });
  const source = registerLark(service);
  await subscribe(service, "session-a");
  await source.publish(envelope("timed-retention"));
  await markDelivered(repository, "session-a", now);
  now += 1001;
  await sweep();
  assert.equal(repository.read((state) => Object.keys(state.mails).length), 0);
  assert.equal(repository.read((state) => Object.keys(state.dedup).length), 1);
  await service.close();
  assert.equal(timerDisposed, true);
});
