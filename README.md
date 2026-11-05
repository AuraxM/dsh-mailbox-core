# Agent Mailbox

`@local/dsh-agent-mailbox` is a Host-only Cordis Bundle with Loader row `agent-mailbox`. It exposes `ctx.agentMailbox` and seven per-Agent tools for deterministic external-event Subscriptions. Mail is global; each matching Session receives at most one Delivery per Mail, with all matched Subscription ids in the snapshot.

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
})
const result = await source.publish(envelope) // accepted/duplicate only after durable snapshot commit
source.setStatus({ state: 'connected', detail: 'listening' })
source.getConfig()
source.onConfigChange((config, meta) => restartOrReconfigure(config))
source.dispose() // idempotent
```

The global dedup key is `sourceId + sourceInstance + eventId`. Sources cannot route to Sessions, supply prompts, request a wake-up, or attach processing behavior. Attachments are bounded metadata; inline payload data is rejected.

A source can supply `validateSubscription(match)` to enforce its own configured scope. A rejected Subscription returns `MATCH_SCOPE_INVALID` before persistence; existing Subscriptions expose a `scopeWarning` in `mailbox_subscriptions` when the source's current scope no longer covers them. Source transport readiness is separate: a degraded-but-functional transport may report `deliveryReady: true` explicitly.

## Editable source settings

Each source owns a versioned, data-only Settings schema: labelled groups and fields (`boolean`, `select`, `multi-select`, `string-list`, `number`, `text`, `textarea`), optional suggestions actions, and an optional auth-status action. A field may declare `visibleWhen: { key, in }` to appear only for matching sibling-field values, such as showing a conversation allowlist only for user/auto identities. The core validates the schema, stores one revisioned JSON config per `sourceId:instance`, and calls every config listener after durable save. Config listeners run in the save path; a runtime apply failure is returned to the UI without rolling back the saved config.

The generic **Settings → Agent Mailbox** page discovers these schemas and renders them without source-specific UI code. Suggestion-backed list fields use a two-pane picker with instant name search, a persistent selected pane, and apply/cancel semantics; selected names are shown in the field summary, and raw IDs are not exposed. The page also shows source connection state, effective config revision, allowlist/config errors, and source-provided auth status. Future sources (for example Git branch filters) reuse the same page by declaring their own fields and optional discovery action.

Writes are accepted only from loopback HTTP clients. The page never accepts secrets: source credentials stay in each source's native authentication mechanism. Agent tools cannot edit source settings. The route is `/agent-mailbox/api/state`, `/agent-mailbox/api/config`, and `/agent-mailbox/api/action`; all responses are JSON with no-store caching. Without a `webServer` service the core remains functional and the Settings route is absent.

Agent tools remain `mailbox_sources`, `mailbox_subscribe`, `mailbox_subscriptions`, `mailbox_subscription_update`, `mailbox_history`, `mailbox_get`, and `mailbox_defer`. Their Session is always `exec.agent.id`. History and full text are bounded and cursor/offset paged. A Subscription contains only match rules, enablement, expiry, and audit fields; source settings are user-only.

`mailbox_sources` deliberately returns a compact `deliveryReady` boolean only; transport details and reconnect errors stay in the Settings API and panel. Subscriptions remain valid while delivery is deferred, and the prompt directs ongoing external monitoring through Mailbox and surfaces the relevant Settings action to the user.

## Delivery and persistence

- Running Agent: `agent.inject(batch)` after the merge window; no second Loop. If the Turn closes before the injected batch is claimed, the scheduler sees the Agent become idle and issues one `followup(wake)` for the still-pending batch.
- Idle Agent: `agent.inject(batch)` plus one non-empty `agent.followup(wake)`.
- Offline non-archived Session: durable queue; scheduling resumes when `agent/created` fires, without automatically resuming a Session.
- Archived Session: the Mail is still stored, but no Delivery is created for it. Existing queued/deferred Deliveries for archived Sessions are deleted and planned batches are cancelled when the workspace archive set is observed. Unarchiving does not backfill discarded Mail. The core reads the startup workspace archive snapshot and follows `domain/changed` updates from the `workspace` domain.
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

The tests use `node:test` with in-memory storage and Agent/Context fakes. They cover concurrent writes, dedup, fanout, per-Session coalescing, running/idle/offline delivery, recovery, permission isolation, defer, disable/expiry, time fields, capacity, source Settings revisions/actions/HTTP gating, schema limits, and teardown. The client bundle is syntax/manifest checked and its live Settings slot is inspected after installation; no automated visual screenshot is available in the Host environment.
