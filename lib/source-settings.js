import { boundedString, clone, isObject, jsonSize } from "./util.js";

export const SETTINGS_FIELD_TYPES = Object.freeze([
  "boolean",
  "select",
  "multi-select",
  "string-list",
  "number",
  "text",
  "textarea",
]);

const FIELD_KEYS = new Set(["key", "type", "labelI18n", "hintI18n", "placeholderI18n", "required", "options", "min", "max", "step", "suggestionsAction"]);
const GROUP_KEYS = new Set(["id", "titleI18n", "descriptionI18n", "fields"]);

function assertI18n(value, label) {
  if (typeof value === "string") {
    boundedString(value, label, 500);
    return;
  }
  if (!isObject(value)) throw new TypeError(`${label} must be a string or a locale object`);
  let count = 0;
  for (const [locale, text] of Object.entries(value)) {
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(locale)) throw new TypeError(`${label}.${locale} is not a locale tag`);
    boundedString(text, `${label}.${locale}`, locale === "zh" ? 500 : 1000);
    count += 1;
  }
  if (count === 0) throw new TypeError(`${label} must contain at least one locale`);
}

function assertKey(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)) {
    throw new TypeError(`${label} must be a stable identifier`);
  }
}

function normalizeField(field, index, seen) {
  const label = `settings field[${index}]`;
  if (!isObject(field)) throw new TypeError(`${label} must be an object`);
  for (const key of Object.keys(field)) if (!FIELD_KEYS.has(key)) throw new TypeError(`${label} has unsupported field '${key}'`);
  assertKey(field.key, `${label}.key`);
  if (seen.has(field.key)) throw new TypeError(`duplicate settings field '${field.key}'`);
  seen.add(field.key);
  if (!SETTINGS_FIELD_TYPES.includes(field.type)) throw new TypeError(`${label}.type is unsupported`);
  assertI18n(field.labelI18n, `${label}.labelI18n`);
  if (field.hintI18n !== undefined) assertI18n(field.hintI18n, `${label}.hintI18n`);
  if (field.placeholderI18n !== undefined) assertI18n(field.placeholderI18n, `${label}.placeholderI18n`);
  if (field.suggestionsAction !== undefined) assertKey(field.suggestionsAction, `${label}.suggestionsAction`);
  if (field.required !== undefined && typeof field.required !== "boolean") throw new TypeError(`${label}.required must be boolean`);
  if (field.type === "number") {
    for (const key of ["min", "max", "step"]) {
      if (field[key] !== undefined && (typeof field[key] !== "number" || !Number.isFinite(field[key]))) {
        throw new TypeError(`${label}.${key} must be a finite number`);
      }
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) throw new TypeError(`${label}.min exceeds max`);
  }
  if (field.type === "select" || field.type === "multi-select") {
    if (!Array.isArray(field.options) || field.options.length === 0 || field.options.length > 64) {
      throw new TypeError(`${label}.options must contain 1 to 64 entries`);
    }
    const values = new Set();
    for (const [optionIndex, option] of field.options.entries()) {
      if (!isObject(option) || typeof option.value !== "string" || option.value === "") {
        throw new TypeError(`${label}.options[${optionIndex}].value must be a non-empty string`);
      }
      if (values.has(option.value)) throw new TypeError(`${label} repeats option '${option.value}'`);
      values.add(option.value);
      assertI18n(option.labelI18n, `${label}.options[${optionIndex}].labelI18n`);
      if (option.descriptionI18n !== undefined) assertI18n(option.descriptionI18n, `${label}.options[${optionIndex}].descriptionI18n`);
    }
  }
  return clone(field);
}

function normalizeAuth(value) {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new TypeError("settings.auth must be an object");
  assertKey(value.action, "settings.auth.action");
  assertI18n(value.titleI18n, "settings.auth.titleI18n");
  if (value.hintI18n !== undefined) assertI18n(value.hintI18n, "settings.auth.hintI18n");
  assertI18n(value.refreshLabelI18n, "settings.auth.refreshLabelI18n");
  return clone(value);
}

/**
 * Source-owned presentation schema for the generic Mailbox Settings page.
 * It carries labels, controls, and references to source actions; it never
 * carries executable code or secret values.
 */
export function normalizeSourceSettings(value) {
  if (value === undefined) return null;
  if (!isObject(value)) throw new TypeError("source settings schema must be an object");
  if (value.version !== 1) throw new TypeError("source settings schema version must be 1");
  assertI18n(value.titleI18n, "settings.titleI18n");
  if (value.descriptionI18n !== undefined) assertI18n(value.descriptionI18n, "settings.descriptionI18n");
  if (!Array.isArray(value.groups) || value.groups.length === 0 || value.groups.length > 12) {
    throw new TypeError("settings.groups must contain 1 to 12 groups");
  }
  const groupIds = new Set();
  const fieldKeys = new Set();
  const groups = value.groups.map((group, groupIndex) => {
    const label = `settings.groups[${groupIndex}]`;
    if (!isObject(group)) throw new TypeError(`${label} must be an object`);
    for (const key of Object.keys(group)) if (!GROUP_KEYS.has(key)) throw new TypeError(`${label} has unsupported field '${key}'`);
    assertKey(group.id, `${label}.id`);
    if (groupIds.has(group.id)) throw new TypeError(`duplicate settings group '${group.id}'`);
    groupIds.add(group.id);
    assertI18n(group.titleI18n, `${label}.titleI18n`);
    if (group.descriptionI18n !== undefined) assertI18n(group.descriptionI18n, `${label}.descriptionI18n`);
    if (!Array.isArray(group.fields) || group.fields.length === 0 || group.fields.length > 40) {
      throw new TypeError(`${label}.fields must contain 1 to 40 fields`);
    }
    return {
      id: group.id,
      titleI18n: clone(group.titleI18n),
      ...(group.descriptionI18n === undefined ? {} : { descriptionI18n: clone(group.descriptionI18n) }),
      fields: group.fields.map((field, index) => normalizeField(field, `${groupIndex}.${index}`, fieldKeys)),
    };
  });
  const output = {
    version: 1,
    titleI18n: clone(value.titleI18n),
    ...(value.descriptionI18n === undefined ? {} : { descriptionI18n: clone(value.descriptionI18n) }),
    groups,
    ...(value.auth === undefined ? {} : { auth: normalizeAuth(value.auth) }),
  };
  if (jsonSize(output) > 65536) throw new TypeError("source settings schema exceeds 64 KiB");
  return output;
}

export function normalizeSourceConfig(value, validator, label = "source config") {
  if (!isObject(value)) throw new TypeError(`${label} must be an object`);
  const input = clone(value);
  if (jsonSize(input) > 65536) throw new TypeError(`${label} exceeds 64 KiB`);
  let output;
  try {
    output = validator(input);
  } catch (error) {
    const issue = String(error?.message || error || "validation failed").slice(0, 2000);
    const wrapped = new TypeError(issue);
    wrapped.code = "INVALID_SOURCE_CONFIG";
    throw wrapped;
  }
  if (!isObject(output)) throw new TypeError(`${label} validator must return an object`);
  const normalized = clone(output);
  if (jsonSize(normalized) > 65536) throw new TypeError(`${label} exceeds 64 KiB after validation`);
  return normalized;
}
