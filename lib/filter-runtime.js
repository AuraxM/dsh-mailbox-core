import { lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { clone, errorMessage, jsonSize } from "./util.js";

export class FilterExecutionError extends Error {
  constructor(code, message, { retryable = false, phase = "execution" } = {}) {
    super(message);
    this.name = "FilterExecutionError";
    this.code = code;
    this.retryable = retryable;
    this.phase = phase;
  }
}

export function validateFilterDefinition(input, maxSourceChars = 16384) {
  if (input === undefined || input === null) return null;
  if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("match.filter must be an object");
  const allowed = new Set(["version", "language", "source"]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new TypeError(`Unsupported match.filter field: ${key}`);
  if (input.version !== 1) throw new TypeError("match.filter.version must be 1");
  if (input.language !== "javascript") throw new TypeError("match.filter.language must be javascript");
  if (typeof input.source !== "string" || input.source.trim() === "") throw new TypeError("match.filter.source must be a non-empty JavaScript function expression");
  if (input.source.length > maxSourceChars) throw new TypeError(`match.filter.source exceeds ${maxSourceChars} characters`);
  if (input.source.includes("\u0000")) throw new TypeError("match.filter.source contains a null character");
  return { version: 1, language: "javascript", source: input.source };
}

function filterProgram(filter, mail, programFormat) {
  const body = `const mail = ${JSON.stringify(mail)};\n` +
    `const filter = (${filter.source});\n` +
    `if (typeof filter !== "function") throw new TypeError("Mailbox filter must be a JavaScript function expression");\n` +
    `const value = await filter(mail);\n` +
    `if (typeof value !== "boolean") throw new TypeError("Mailbox filter must return a boolean");\n` +
    `return value;`;
  if (programFormat === "function-body") return body;
  if (programFormat === "script" || programFormat === "repl") return `(async () => {\n${body}\n})()`;
  throw new FilterExecutionError("FILTER_RUNTIME_UNAVAILABLE", `Unsupported PTC program format: ${programFormat}`, { retryable: true, phase: "unavailable" });
}

function failureFromResult(result) {
  const failure = result?.error;
  if (!failure) return null;
  const kind = String(failure.kind || "exception");
  const message = errorMessage(failure.message || "Mailbox filter execution failed");
  // Protocol failures can be caused deterministically by guest control writes,
  // so retrying would poison the cursor. Abort and worker-exit follow the PTC
  // substrate lifecycle contract and remain infrastructure-retryable.
  const retryable = ["abort", "sandbox-unavailable", "worker-exit"].includes(kind);
  return new FilterExecutionError(retryable ? "FILTER_RUNTIME_UNAVAILABLE" : "FILTER_EXECUTION_FAILED", message, {
    retryable,
    phase: kind === "timeout" ? "timeout" : "execution",
  });
}

/** Host-internal PTC consumer. It has no model-facing tool or Agent REPL dependency. */
export class PtcFilterRuntime {
  constructor({ ptcRuntime, getPtcRuntime, cwd, ownsCwd = false, timeoutMs = 2000 }) {
    this.getPtcRuntime = getPtcRuntime || (() => ptcRuntime);
    this.cwd = cwd;
    this.ownsCwd = ownsCwd;
    this.timeoutMs = timeoutMs;
    this.controller = new AbortController();
    this.pending = new Set();
    this.closed = false;
    this.closePromise = null;
  }

  static async open({ ptcRuntime, getPtcRuntime, timeoutMs = 2000 }) {
    const cwd = await mkdtemp(path.join(tmpdir(), "agent-mailbox-filter-"));
    return new PtcFilterRuntime({ ptcRuntime, getPtcRuntime, cwd, ownsCwd: true, timeoutMs });
  }

  currentRuntime() {
    try {
      const runtime = this.getPtcRuntime?.();
      return runtime?.language === "typescript" && ["function-body", "script", "repl"].includes(runtime.programFormat) ? runtime : null;
    } catch {
      return null;
    }
  }

  get available() {
    return Boolean(this.currentRuntime()) && !this.closed;
  }

  async execute(filter, mail) {
    if (!this.available || this.controller.signal.aborted) {
      throw new FilterExecutionError("FILTER_RUNTIME_UNAVAILABLE", "JavaScript filters require an open Host PTC Runtime service", { retryable: true, phase: "unavailable" });
    }
    const operation = this.executeActive(filter, mail);
    this.pending.add(operation);
    try {
      return await operation;
    } finally {
      this.pending.delete(operation);
    }
  }

  async executeActive(filter, mail) {
    const startedAt = Date.now();
    if (jsonSize(mail) > 262144) throw new FilterExecutionError("FILTER_EXECUTION_FAILED", "Mailbox filter input exceeds 256 KiB", { phase: "input" });
    let result;
    const ptcRuntime = this.currentRuntime();
    if (!ptcRuntime) {
      throw new FilterExecutionError("FILTER_RUNTIME_UNAVAILABLE", "JavaScript filters require the Host TypeScript PTC Runtime service", { retryable: true, phase: "unavailable" });
    }
    const program = filterProgram(filter, mail, ptcRuntime.programFormat);
    try {
      const spec = ptcRuntime.resolve({
        program,
        bindings: [],
        cwd: this.cwd,
        timeoutMs: this.timeoutMs,
        sandboxPolicy: { mode: "read-only", workspaceRoot: this.cwd },
        signal: this.controller.signal,
      });
      result = await ptcRuntime.run(spec);
    } catch (error) {
      if (error instanceof FilterExecutionError) throw error;
      throw new FilterExecutionError("FILTER_RUNTIME_UNAVAILABLE", errorMessage(error), { retryable: true, phase: "unavailable" });
    }
    const failure = failureFromResult(result);
    if (failure) throw failure;
    if (typeof result?.value !== "boolean") {
      throw new FilterExecutionError("FILTER_EXECUTION_FAILED", "Mailbox filter must return a boolean", { phase: "invalid-return" });
    }
    return { value: result.value, durationMs: Math.max(0, Date.now() - startedAt) };
  }

  close() {
    if (!this.closePromise) {
      this.closed = true;
      const attempt = (async () => {
        this.controller.abort();
        await Promise.allSettled([...this.pending]);
        const cwd = this.cwd;
        if (!cwd || !this.ownsCwd) return;
        const resolved = path.resolve(cwd);
        const parent = path.dirname(resolved);
        const basename = path.basename(resolved);
        const prefix = "agent-mailbox-filter-";
        if (parent !== path.resolve(tmpdir()) || !basename.startsWith(prefix) || basename.length <= prefix.length) {
          throw new Error(`Refusing to remove an unexpected Mailbox filter workspace: ${resolved}`);
        }
        let stat;
        try {
          stat = await lstat(resolved);
        } catch (error) {
          if (error?.code === "ENOENT") {
            this.cwd = null;
            this.ownsCwd = false;
            return;
          }
          throw error;
        }
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refusing to recursively remove a non-directory Mailbox filter workspace: ${resolved}`);
        await rm(resolved, { recursive: true, force: true });
        this.cwd = null;
        this.ownsCwd = false;
      })();
      this.closePromise = attempt;
      attempt.catch(() => {
        if (this.closePromise === attempt) this.closePromise = null;
      });
    }
    return this.closePromise;
  }
}

export function filterInputFromMail(mail) {
  const input = clone(mail);
  delete input.mailSeq;
  input.facts ??= {};
  if (input.conversation && input.conversation.threadId === undefined) input.conversation.threadId = null;
  return input;
}
