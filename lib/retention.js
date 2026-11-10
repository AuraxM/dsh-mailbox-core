import { compareCoreTime } from "./util.js";

const PENDING_STATES = new Set(["queued", "deferred"]);

function deliveriesByMail(state) {
  const grouped = new Map();
  for (const delivery of Object.values(state.deliveries)) {
    const rows = grouped.get(delivery.mailId) || [];
    rows.push(delivery);
    grouped.set(delivery.mailId, rows);
  }
  return grouped;
}

function removeMail(state, mailId, related) {
  const removedDeliveryIds = new Set(related.map((delivery) => delivery.deliveryId));
  for (const deliveryId of removedDeliveryIds) delete state.deliveries[deliveryId];
  for (const [batchId, batch] of Object.entries(state.batches)) {
    if (batch.deliveryIds.every((deliveryId) => removedDeliveryIds.has(deliveryId))) delete state.batches[batchId];
  }
  delete state.mails[mailId];
}

/** Remove the oldest Mail with no queued or deferred Delivery while preserving its dedup tombstone. */
export function removeOldestSettledMail(state) {
  const grouped = deliveriesByMail(state);
  const candidates = Object.values(state.mails).filter((mail) => {
    const related = grouped.get(mail.mailId) || [];
    return related.every((delivery) => !PENDING_STATES.has(delivery.state));
  }).sort((a, b) => compareCoreTime(a.receivedAt, b.receivedAt, a.mailSeq, b.mailSeq));
  const mail = candidates[0];
  if (!mail) return false;
  removeMail(state, mail.mailId, grouped.get(mail.mailId) || []);
  return true;
}

/**
 * Remove orphaned Mail immediately and terminal Mail after its retention window.
 * Queued, deferred, and in-flight Delivery records keep their Mail alive.
 */
export function pruneExpiredMail(state, nowMs, retentionMs) {
  const grouped = deliveriesByMail(state);
  let removed = 0;
  for (const mail of Object.values(state.mails)) {
    const related = grouped.get(mail.mailId) || [];
    if (related.some((delivery) => PENDING_STATES.has(delivery.state))) continue;
    let retainUntil = -Infinity;
    let expired = related.length === 0;
    if (!expired) {
      retainUntil = Math.max(...related.map((delivery) => Date.parse(delivery.updatedAt))) + retentionMs;
      expired = Number.isFinite(retainUntil) && retainUntil <= nowMs;
    }
    if (!expired) continue;
    removeMail(state, mail.mailId, related);
    removed += 1;
  }
  return removed;
}
