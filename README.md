# Agent Mailbox

`@local/dsh-agent-mailbox` is a Host-only Cordis Bundle with Loader row `agent-mailbox`. It exposes `ctx.agentMailbox` and ten per-Agent tools for external-event Subscriptions with optional JavaScript predicates. Mail is global; each matching Session receives at most one Delivery per Mail, with all matched Subscription ids in the snapshot.

## Source API

```js
const source = ctx.agentMailbox.registerSource({
  sourceId: 'lark',
  instance: 'main',
  displayName: 'Lark',
  kinds: ['message.received'],
  filterFields: ['sourceId', 'sourceInstance', 'kinds', 'conversationIds', 'textContainsAny', 'textContainsAll'],
  capabilities: { reply: false, threadContext: false },
  settings: sourceSettingsSchema,         // data-only fields/groups/actions for Settings
  defaultConfig: { enabled: false },      // validated by the source
  validateConfig(config) { return normalize(config) }, // synchronous, throws field errors
  validateSubscription(match) { assertInSourceScope(match) }, // optional source scope guard
  actions: { authStatus, listChats },     // user-only read/preview actions
  javascriptFilter: {                     // optional source-side JS filter contract
    reference: { facts: [], templates: [] },
    async testEvent(match) { return syntheticFixture(match) },
    async resolveValues(input) { return { items: [], nextCursor: null } },
  },
})
const result = await source.publish(envelope) // accepted/duplicate only after durable dedup and any Delivery commit
source.setStatus({ state: 'connected', detail: 'listening' })
source.getConfig()
source.onConfigChange((config, meta) => restartOrReconfigure(config))
source.dispose() // idempotent
```

The global dedup key is `sourceId + sourceInstance + eventId`. Sources cannot route to Sessions, supply prompts, request a wake-up, or attach processing behavior. Attachments are bounded metadata; inline payload data is rejected.

An event that produces no Delivery is acknowledged after persisting only its dedup marker; its Mail body is not stored. Queued, deferred, and in-flight Deliveries retain their Mail. After every Delivery for a Mail reaches a terminal state (`delivered`, `cancelled`, or `dead-letter`), the Mail and its Delivery records remain readable for `mailRetentionMs` (24 hours by default), measured from the latest Delivery update. A startup sweep and the `retentionSweepIntervalMs` timer (one minute by default) remove expired Mail, Deliveries, and fully consumed batches while preserving dedup tombstones. Capacity pressure can reclaim settled Mail earlier.

A source can supply `validateSubscription(match)` to enforce its own configured scope. A rejected Subscription returns `MATCH_SCOPE_INVALID` before persistence; existing Subscriptions expose a `scopeWarning` in `mailbox_subscriptions` when the source's current scope no longer covers them. Source transport readiness is separate: a degraded-but-functional transport may report `deliveryReady: true` explicitly.

## JavaScript filters and Mail facts

A Subscription may add `match.filter = { version: 1, language: 'javascript', source: '(mail) => boolean' }`. Exact `sourceId` and `sourceInstance` are required. Static fields, including `conversationIds` and `threadIds`, run first; JavaScript executes only for the remaining candidate Subscriptions. The optional source envelope `facts` object carries bounded source-specific JSON such as current issue fields and `changedFields/from/to` transition data.

Every create or replacement of a filter executes the source's synthetic `testEvent` before persistence. Compilation errors, exceptions, timeouts, and non-boolean results reject the new source text. A failed update leaves the previous filter untouched. `mailbox_filter_reference` exposes source documentation and templates, `mailbox_field_values` resolves names to stable ids, and `mailbox_filter_test` can replay a Delivery owned by the current Session.

The Host consumes `ctx.ptcRuntime` directly with no tool bindings, a separate empty read-only working directory, bounded source/input sizes, and an execution timeout. It does not use or require the Agent's PTC preset, `run_code` tool, or REPL state. The adapter supports the current `function-body`, `script`, and `repl` program formats while retaining one-shot filter semantics. PTC file confinement is not network isolation; filter guidance prohibits imports, network access, and side effects. There is no `eval` or Host-VM fallback. Without a compatible Runtime, static Subscriptions continue to work, new JavaScript filters return `FILTER_RUNTIME_UNAVAILABLE`, and existing filtered publications are retryable.

Filtering runs outside the durable write transaction. A subscription revision check prevents an in-flight result from being committed after an update. A real-event code error fails closed for that Subscription and exposes a bounded `filterWarning` without blocking other Subscriptions. Provider aborts, worker-exit substrate failures, and unavailable confinement are retryable without committing Mail/dedup state; deterministic protocol, exception, and timeout failures close only the affected filter. Concurrent close calls share one cleanup Promise and await in-flight executions.

## Editable source settings

Each source owns a versioned, data-only Settings schema: labelled groups and fields (`boolean`, `select`, `multi-select`, `string-list`, `number`, `text`, `textarea`), optional suggestions actions, and an optional auth-status action. A field may declare `visibleWhen: { key, in }` to appear only for matching sibling-field values, such as showing a conversation allowlist only for user/auto identities. The core validates the schema, stores one revisioned JSON config per `sourceId:instance`, and calls every config listener after durable save. Config listeners run in the save path; a runtime apply failure is returned to the UI without rolling back the saved config.

The generic **Settings → Agent Mailbox** page discovers these schemas and renders them without source-specific UI code. Each source card is collapsible and starts collapsed; its header retains the connection state and an unsaved-change indicator while collapsed. Suggestion-backed list fields use a two-pane picker with instant name search, a persistent selected pane, and apply/cancel semantics; selected names are shown in the field summary, and raw IDs are not exposed. The page also shows source connection state, effective config revision, allowlist/config errors, and source-provided auth status. Future sources (for example Git branch filters) reuse the same page by declaring their own fields and optional discovery action.

Writes are accepted only from loopback HTTP clients. Source Settings fields never accept secrets. A source may declare `settings.credentials` entries (`ref`, localized labels, optional `secret: false` for non-secret identifiers such as usernames); the generic page renders save/clear controls which write through `ctx.remote.credentials` and return only configuration metadata. JNPM's existing single-token controls remain compatible through the built-in environment mapping. Secret values never enter source configuration JSON. Agent tools cannot edit source settings or credentials. The route is `/agent-mailbox/api/state`, `/agent-mailbox/api/config`, and `/agent-mailbox/api/action`; all responses are JSON with no-store caching. Without a `webServer` service the core remains functional and the Settings route is absent.

When several JNPM environments are installed, the page presents one JNPM card with an environment selector instead of four independent cards. The selector changes only the visible editor: `jnpm:prod`, `jnpm:gz`, `jnpm:hgame`, and `jnpm:neon` retain independent configuration, cursors, revisions, subscriptions, and runtime state. JNPM project pickers use project-specific labels while other sources retain conversation labels.

Agent tools are `mailbox_sources`, `mailbox_filter_reference`, `mailbox_field_values`, `mailbox_filter_test`, `mailbox_subscribe`, `mailbox_subscriptions`, `mailbox_subscription_update`, `mailbox_history`, `mailbox_get`, and `mailbox_defer`. Their Session is always `exec.agent.id`. History and full text are bounded and cursor/offset paged. A Subscription contains only match rules, enablement, expiry, and audit fields; source settings are user-only.

`mailbox_sources` deliberately returns a compact `deliveryReady` boolean only; transport details and reconnect errors stay in the Settings API and panel. Subscriptions remain valid while delivery is deferred, and the prompt directs ongoing external monitoring through Mailbox and surfaces the relevant Settings action to the user.

## Delivery and persistence

- Running Agent: `agent.inject(batch)` after the merge window; no second Loop. If the Turn closes before the injected batch is claimed, the scheduler sees the Agent become idle and issues one `followup(wake)` for the still-pending batch.
- Idle Agent: `agent.inject(batch)` plus one non-empty `agent.followup(wake)`.
- Offline non-archived Session: durable queue; scheduling resumes when `agent/created` fires, without automatically resuming a Session.
- Archived Session: no Delivery is created, so the publication retains only its dedup marker. Existing queued/deferred Deliveries for archived Sessions are deleted and planned batches are cancelled when the workspace archive set is observed; a Mail left with no Deliveries is removed immediately. Unarchiving does not backfill discarded Mail. The core reads the startup workspace archive snapshot and follows `domain/changed` updates from the `workspace` domain.
- The adapter awaits `ctx.sessions.flush(agent.session)` before marking a batch delivered. Stable message/batch/Delivery ids in existing `agent/inbox/spliced` and `user/message` records support crash reconciliation.
- A batch is persisted as `injecting` before `agent.inject()`. Log evidence after a crash is reconciled only after a durability checkpoint. An `injecting` lease with no log evidence is rolled back to `planned` and retried, bounded by `maxInjectAttempts`; once `agent.inject()` has succeeded, later wake/checkpoint errors are reconciled instead of dead-lettering the batch.
- Batch rendering and the `planned → injecting` transition share one serialized store transaction, and Subscription updates skip in-flight batches, so a concurrent disable cannot remove an already rendered delivery.
- Explicit defer creates another injection of the same Delivery at the required future time. A delivered Delivery never wakes an Agent merely because it exists.

State uses the `agent_mailbox` Domain global slot. A single process-local Promise chain serializes every complete read-modify-write; memory advances only after `global.set()` acknowledges durability. This gives an atomic Mail + current Delivery publication snapshot without adding Session Event types.

**First-version scale limit:** every mutation writes one full JSON snapshot. Defaults cap Mail at 2,000, Deliveries at 20,000, dedup entries at 10,000, batches at 40,000, pending Deliveries per Session at 200, and Subscriptions per Session at 100. Oldest fully settled Mail is reclaimed under pressure; dedup tombstones remain until that separate bounded window is reclaimed. Pending work is never silently discarded: capacity failure returns `retryable`. Multiple Host processes must not write the same snapshot. Higher-volume deployments need a transactional storage design rather than this full-snapshot format.

Configuration defaults and bounds are in `lib/config.js`; `cordis.patch.yml` supplies an empty config object. Runtime code has no third-party package dependency.

## Verification

```sh
npm run check
npm test
# equivalently: node --test test/*.test.js
```

The tests use `node:test` with in-memory storage and Agent/Context/PTC fakes. They cover concurrent writes, dedup, unmatched-event discard, fanout, per-Session coalescing, running/idle/offline delivery, recovery, permission isolation, defer, disable/expiry, time fields, terminal-Mail retention and timer cleanup, capacity, source Settings revisions/actions/HTTP gating, mandatory synthetic filter tests, fail-closed runtime errors, revision races, PTC policy, and teardown. The client bundle is syntax/manifest checked and its live Settings slot is inspected after installation; no automated visual screenshot is available in the Host environment.
