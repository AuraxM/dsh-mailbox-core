export const DEFAULT_CONFIG = Object.freeze({
  mergeWindowMs: 3000,
  recoveryIntervalMs: 30000,
  wakeCooldownMs: 1000,
  retryAfterMs: 5000,
  retryBaseMs: 1000,
  maxInjectAttempts: 5,
  batchSize: 10,
  maxBatchChars: 16000,
  injectionPreviewChars: 800,
  historyPageSize: 20,
  maxHistoryPageSize: 100,
  getPageChars: 12000,
  maxGetPageChars: 50000,
  maxTextChars: 65536,
  maxAttachments: 16,
  maxAttachmentMetadataChars: 4096,
  maxAttributesChars: 16384,
  maxSubscriptionsPerSession: 100,
  maxSubscriptions: 10000,
  maxPendingPerSession: 200,
  maxMails: 2000,
  maxDeliveries: 20000,
  maxDedup: 10000,
  maxBatches: 40000,
});

const LIMITS = {
  mergeWindowMs: [0, 60000],
  recoveryIntervalMs: [0, 3600000],
  wakeCooldownMs: [0, 60000],
  retryAfterMs: [1, 3600000],
  retryBaseMs: [1, 3600000],
  maxInjectAttempts: [1, 100],
  batchSize: [1, 100],
  maxBatchChars: [1000, 200000],
  injectionPreviewChars: [80, 20000],
  historyPageSize: [1, 100],
  maxHistoryPageSize: [1, 500],
  getPageChars: [100, 50000],
  maxGetPageChars: [100, 200000],
  maxTextChars: [1, 1000000],
  maxAttachments: [0, 100],
  maxAttachmentMetadataChars: [128, 65536],
  maxAttributesChars: [128, 262144],
  maxSubscriptionsPerSession: [1, 1000],
  maxSubscriptions: [1, 100000],
  maxPendingPerSession: [1, 10000],
  maxMails: [1, 100000],
  maxDeliveries: [1, 1000000],
  maxDedup: [1, 1000000],
  maxBatches: [1, 1000000],
};

export function normalizeConfig(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("agent-mailbox config must be an object");
  }
  const known = new Set(Object.keys(DEFAULT_CONFIG));
  for (const key of Object.keys(input)) {
    if (!known.has(key)) throw new TypeError(`Unknown agent-mailbox config field: ${key}`);
  }
  const result = { ...DEFAULT_CONFIG };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const value = input[key] ?? result[key];
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new TypeError(`${key} must be an integer from ${min} to ${max}`);
    }
    result[key] = value;
  }
  if (result.historyPageSize > result.maxHistoryPageSize) {
    throw new TypeError("historyPageSize cannot exceed maxHistoryPageSize");
  }
  if (result.getPageChars > result.maxGetPageChars) {
    throw new TypeError("getPageChars cannot exceed maxGetPageChars");
  }
  if (result.injectionPreviewChars * result.batchSize > result.maxBatchChars * 4) {
    throw new TypeError("injectionPreviewChars and batchSize exceed the batch budget");
  }
  return Object.freeze(result);
}
