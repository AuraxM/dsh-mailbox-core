import { normalizeConfig } from "./lib/config.js";
import { AgentMailbox } from "./lib/mailbox.js";
import { createSettingsRouter } from "./lib/settings-api.js";
import { MailboxRepository } from "./lib/store.js";
import { createMailboxTools, MAILBOX_PROMPT } from "./lib/tools.js";
import { errorMessage, safeCall } from "./lib/util.js";

export const name = "agent-mailbox";
export const inject = ["agents", "sessions", "storageDomain", "tools", "systemPrompt", "timer"];

export async function apply(ctx, rawConfig = {}) {
  const config = normalizeConfig(rawConfig);
  const logger = (level, message) => {
    try {
      ctx.logger?.[level]?.(message);
    } catch {
      // Logging must not interrupt delivery or cleanup.
    }
  };
  const repository = await MailboxRepository.open(ctx.storageDomain, Date.now);
  const service = new AgentMailbox({
    repository,
    config,
    now: Date.now,
    logger,
    timer: ctx.timer,
    flush: (session) => ctx.sessions.flush(session),
  });
  const scopedDisposers = new Map();

  function attach(agent) {
    const sessionId = String(agent.id);
    if (scopedDisposers.has(sessionId)) return;
    const disposeScope = agent.ctx.effect(() => {
      const registrations = createMailboxTools(service).map((definition) => agent.ctx.tools.register(definition));
      return () => {
        for (const dispose of registrations.reverse()) safeCall(dispose, logger, "Mailbox tool cleanup");
      };
    }, "agent-mailbox per-Agent tools");
    scopedDisposers.set(sessionId, disposeScope);
    service.attachAgent(agent);
  }

  function detach(agent) {
    const sessionId = String(agent.id);
    service.detachAgent(sessionId);
    const disposeScope = scopedDisposers.get(sessionId);
    scopedDisposers.delete(sessionId);
    safeCall(disposeScope, logger, "Mailbox Agent scope cleanup");
  }

  try {
    const settingsRouter = createSettingsRouter({ service });
    ctx.inject(["webServer"], (webCtx) => {
      try {
        webCtx.effect(() => webCtx.webServer.register({
          kind: "prefix",
          path: settingsRouter.prefix,
          handler: async (req, res) => {
            const raw = req.url || "/";
            let stripped = raw.slice(settingsRouter.prefix.length);
            if (stripped === "" || stripped.startsWith("?")) stripped = `/${stripped}`;
            req.url = stripped;
            await settingsRouter.handle(req, res);
          },
        }), "agent-mailbox Settings route");
      } catch (error) {
        logger("warn", `agent-mailbox: Settings route unavailable: ${errorMessage(error)}`);
      }
    });
    ctx.effect(() => ctx.provide("agentMailbox", service), "agent-mailbox provide()");
    ctx.effect(() => ctx.systemPrompt.section({
      name: "agent-mailbox",
      order: 160,
      text: MAILBOX_PROMPT,
    }), "agent-mailbox prompt");
    ctx.on("agent/created", ({ agent }) => attach(agent));
    ctx.on("agent/disposed", ({ agent }) => detach(agent));
    for (const agent of ctx.agents.list()) attach(agent);
    ctx.effect(() => async () => {
      for (const agent of ctx.agents.list()) detach(agent);
      for (const [sessionId, dispose] of scopedDisposers) {
        scopedDisposers.delete(sessionId);
        safeCall(dispose, logger, "Mailbox residual Agent scope cleanup");
      }
      await service.close();
    }, "agent-mailbox teardown");
    logger("info", "agent-mailbox: Host service ready");
  } catch (error) {
    await service.close();
    logger("error", `agent-mailbox: activation failed: ${errorMessage(error)}`);
    throw error;
  }
}
