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
  assert.match(source, /jnpmEnvironment/);
  assert.match(source, /remote\.credentials/);
  assert.match(source, /source\.settings\.credentials/);
  assert.match(source, /definition\.secret !== false/);
  assert.match(source, /chooseConversationsProjects/);
  assert.match(source, /type: secret \? "password" : "text"/);
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
  assert.deepEqual([...exported.inject], ["slots", "locale", "remote", "remote.credentials"]);
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

test("source cards default to collapsed and toggle their settings accessibly", () => {
  let source = readFileSync(new URL("../client.js", import.meta.url), "utf8");
  const exportMarker = "exports.apply = apply;";
  assert.ok(source.includes(exportMarker));
  source = source.replace(exportMarker, "exports.__SourceCard = SourceCard;\n    " + exportMarker);
  let registration;
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(value) { registration = value; } } },
    Symbol,
    Object,
    console,
  });
  let collapsed;
  let stateInitialized = false;
  const react = {
    createElement(type, props, ...children) { return { type, props: props || {}, children }; },
    useState(initial) {
      if (!stateInitialized) {
        collapsed = initial;
        stateInitialized = true;
      }
      return [collapsed, (next) => { collapsed = typeof next === "function" ? next(collapsed) : next; }];
    },
    useEffect() {},
  };
  const exported = registration.factory((specifier) => {
    if (specifier === "react") return react;
    return { createPortal(node) { return node; } };
  });
  const props = {
    source: {
      sourceKey: "lark:main",
      sourceId: "lark",
      instance: "main",
      displayName: "Lark",
      revision: 4,
      config: { enabled: true },
      status: { state: "connected" },
      settings: { groups: [] },
    },
    draft: { enabled: true },
    picker: null,
  };
  let card = exported.__SourceCard(props);
  assert.equal(card.type, "section");
  assert.equal(card.props.className, "amb-card collapsed");
  let header = card.children[0];
  let content = card.children[1];
  assert.equal(header.type, "button");
  assert.equal(header.props["aria-expanded"], "false");
  assert.equal(header.props["aria-controls"], content.props.id);
  assert.match(header.props["aria-label"], /展开配置/);
  assert.equal(content.props.hidden, true);

  header.props.onClick();
  card = exported.__SourceCard(props);
  header = card.children[0];
  content = card.children[1];
  assert.equal(card.props.className, "amb-card");
  assert.equal(header.props["aria-expanded"], "true");
  assert.match(header.props["aria-label"], /收起配置/);
  assert.equal(content.props.hidden, false);

  header.props.onClick();
  card = exported.__SourceCard({ ...props, draft: { enabled: false } });
  assert.equal(card.children[1].props.hidden, true);
  const dirtyBadge = card.children[0].children.find((child) => child?.props?.className === "amb-badge dirty");
  assert.ok(dirtyBadge, "collapsed cards keep unsaved changes visible");
});
