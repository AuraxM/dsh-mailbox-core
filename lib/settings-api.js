const MAX_BODY_BYTES = 65536;

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function isLoopback(req) {
  const address = req.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("request body exceeds 64 KiB"), { code: "BODY_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("request body is not valid JSON"), { code: "INVALID_JSON" }));
      }
    });
    req.on("error", reject);
  });
}

function statusFor(error) {
  if (error?.code === "SETTINGS_REVISION_CONFLICT") return 409;
  if (error?.code === "SOURCE_NOT_FOUND" || error?.code === "SOURCE_ACTION_NOT_FOUND") return 404;
  if (error?.code === "BODY_TOO_LARGE" || error?.code === "INVALID_JSON" || error?.code === "INVALID_SOURCE_CONFIG") return 400;
  if (error?.code === "SOURCE_ACTION_TIMEOUT") return 504;
  return 500;
}

export function createSettingsRouter({ service, prefix = "/agent-mailbox" }) {
  async function handle(req, res) {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;
    try {
      if (req.method === "GET" && pathname === "/api/state") {
        sendJson(res, 200, { ok: true, ...service.sourceAdminSnapshot() });
        return;
      }
      if (req.method === "POST" && (pathname === "/api/config" || pathname === "/api/action")) {
        if (!isLoopback(req)) {
          sendJson(res, 403, { ok: false, error: "Mailbox source settings are editable only from this machine" });
          return;
        }
        const payload = await readBody(req);
        if (pathname === "/api/config") {
          const result = await service.updateSourceConfig(
            String(payload.sourceKey || ""),
            payload.config,
            payload.expectedRevision === undefined ? undefined : Number(payload.expectedRevision),
          );
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
        const result = await service.invokeSourceAction(
          String(payload.sourceKey || ""),
          String(payload.action || ""),
          payload.input && typeof payload.input === "object" ? payload.input : {},
        );
        sendJson(res, 200, { ok: true, result });
        return;
      }
      sendJson(res, 404, { ok: false, error: "not found" });
    } catch (error) {
      sendJson(res, statusFor(error), {
        ok: false,
        error: String(error?.message || error || "request failed").slice(0, 2000),
        code: typeof error?.code === "string" ? error.code : undefined,
      });
    }
  }

  return {
    prefix,
    handle,
    async state() {
      return { ok: true, ...service.sourceAdminSnapshot() };
    },
    async updateConfig(payload) {
      return service.updateSourceConfig(String(payload.sourceKey || ""), payload.config, payload.expectedRevision);
    },
    async invokeAction(payload) {
      return service.invokeSourceAction(String(payload.sourceKey || ""), String(payload.action || ""), payload.input || {});
    },
  };
}
