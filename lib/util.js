import { randomUUID } from "node:crypto";

export function id(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function boundedString(value, label, max = 256, optional = false) {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} must be a non-empty string`);
  const normalized = value.trim();
  if (normalized.length > max) throw new TypeError(`${label} exceeds ${max} characters`);
  return normalized;
}

export function isoTime(value, label = "time") {
  const raw = boundedString(value, label, 64);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) throw new TypeError(`${label} must include an ISO 8601 offset`);
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new TypeError(`${label} must be a valid ISO 8601 time`);
  return new Date(ms).toISOString();
}

export function nowIso(now) {
  return new Date(now()).toISOString();
}

export function errorMessage(error) {
  return String(error?.message || error || "unknown error").slice(0, 2000);
}

export function dedupKey(sourceId, sourceInstance, eventId) {
  return JSON.stringify([sourceId, sourceInstance, eventId]);
}

export function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("en-US");
}

export function jsonSize(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor(value) {
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (!isObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new TypeError("cursor is invalid");
  }
}

export function preview(value, max) {
  const text = String(value ?? "");
  if (text.length <= max) return { text, truncated: false, totalChars: text.length };
  return { text: text.slice(0, max), truncated: true, totalChars: text.length };
}

export function compareCoreTime(left, right, leftSeq, rightSeq) {
  const byTime = Date.parse(left) - Date.parse(right);
  return byTime || leftSeq - rightSeq;
}

export function safeCall(dispose, logger, label) {
  try {
    const result = dispose?.();
    if (result && typeof result.then === "function") {
      result.catch((error) => logger("warn", `${label}: ${errorMessage(error)}`));
    }
  } catch (error) {
    logger("warn", `${label}: ${errorMessage(error)}`);
  }
}
