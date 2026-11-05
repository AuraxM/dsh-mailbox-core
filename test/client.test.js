import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

test("client bundle materializes CommonJS exports and registers the Settings section", async () => {
  const source = readFileSync(new URL("../client.js", import.meta.url), "utf8");
  assert.equal(source.includes("高级：手动输入 ID"), false);
  assert.equal(source.includes("Advanced: enter ID manually"), false);
  assert.match(source, /amb-picker-overlay/);
  assert.match(source, /pickerApply/);
  assert.match(source, /isFieldVisible/);
  assert.match(source, /pickerSortHint/);
  let registration;
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(value) { registration = value; } } },
    Symbol,
    Object,
    console,
  });
  assert.equal(registration?.id, "@local/dsh-agent-mailbox");
  const react = {
    createElement() { return null; },
    useState() { return [undefined, () => {}]; },
    useEffect() {},
    useCallback(fn) { return fn; },
  };
  const reactDom = { createPortal(node) { return node; } };
  const exported = registration.factory((specifier) => {
    if (specifier === "react") return react;
    assert.equal(specifier, "react-dom");
    return reactDom;
  });
  assert.deepEqual([...exported.inject], ["slots", "locale"]);
  const registered = [];
  const locale = {
    bind() { return (key) => key; },
    register() { return () => {}; },
    subscribe() { return () => {}; },
    getSnapshot() { return { revision: 0 }; },
  };
  const ctx = {
    locale,
    effect(setup) { return setup(); },
    slots: {
      inject(name, callback) { assert.equal(name, "settings.section"); callback(); },
      register(definition) { registered.push(definition); return () => {}; },
    },
  };
  exported.apply(ctx);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, "settings.section");
  assert.equal(registered[0].id, "agent-mailbox");
});
