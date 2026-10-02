/**
 * DSH SlideStudio local API — real LLM generation + PPTX export.
 * Default: http://127.0.0.1:8787
 */

import http from "node:http";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

async function loadAgent() {
  const core = path.join(root, "packages/agent-core/dist/index.js");
  const node = path.join(root, "packages/agent-core/dist/node.js");
  const browser = await import(pathToFileURL(core).href);
  const nodeApi = await import(pathToFileURL(node).href);
  return { ...browser, ...nodeApi };
}

async function loadExporter() {
  const base = path.join(root, "packages/exporter-pptx/dist/index.js");
  return import(pathToFileURL(base).href);
}

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";

// CORS: legacy local API — loopback origins only by default. Never "*":
// a wildcard would let any web page call generate/export through the local
// server. Extra trusted origins may be opted in via env.
const EXTRA_CORS_ORIGINS = (process.env.OPENSLIDESTUDIO_CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isLoopbackOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return (
      u.hostname === "localhost" ||
      u.hostname.endsWith(".localhost") ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "::1" ||
      u.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/** Returns the request Origin when it is allowed, else null. */
function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null; // non-browser callers get no CORS headers
  if (isLoopbackOrigin(origin) || EXTRA_CORS_ORIGINS.includes(origin)) {
    return origin;
  }
  return null;
}

function corsHeaders(req) {
  const origin = allowedOrigin(req);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

function sendJson(req, res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(req),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    // Preflight succeeds only for allowed origins — no wildcard, no credentials.
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      const agent = await loadAgent();
      const has = agent.hasLlmCredentials();
      const creds = has ? agent.resolveLlmCredentials() : null;
      return sendJson(req, res, 200, {
        ok: true,
        llm: has,
        source: creds?.source ?? null,
        model: creds?.model ?? null,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/generate") {
      const body = await readBody(req);
      const prompt = String(body.prompt || "").trim();
      const pins = Array.isArray(body.pins) ? body.pins : undefined;
      if (!prompt && !(body.references?.length) && !(pins?.length)) {
        return sendJson(req, res, 400, { error: "prompt required" });
      }

      const agent = await loadAgent();
      const modelId = body.modelId || body.model || "auto";
      // Honest multi-model: pins use the same provider resolution as generate/refine.
      // RealLlmProvider implements pin-batch (scoped object apply + pinBatch meta).
      const provider =
        modelId === "mock-offline" || modelId === "mock"
          ? new agent.MockProvider({ baseDelayMs: 40 })
          : agent.resolveProvider({ modelId: modelId === "auto" ? undefined : modelId });

      const steps = [];
      const run = agent.createAgentRun(
        {
          prompt:
            prompt ||
            (pins?.length
              ? `Process ${pins.length} agent annotation(s)`
              : "Create slides from references"),
          title: body.title,
          templateId: body.templateId,
          modelId,
          references: body.references,
          designContract: body.designContract,
          baseDeck: body.baseDeck,
          baseVersionId: body.baseVersionId,
          baseVersionNumber: body.baseVersionNumber,
          pins,
          mockSpeed: 0,
        },
        { provider, autoStart: true },
      );

      run.subscribe((ev) => {
        if (ev.type === "tool_started") {
          steps.push({
            id: ev.stepId,
            tool: ev.tool,
            label: ev.label,
            target: ev.target,
            status: "running",
          });
        } else if (ev.type === "tool_completed") {
          const s = steps.find((x) => x.id === ev.stepId);
          if (s) {
            s.status = "completed";
            s.summary = ev.summary;
          }
        } else if (ev.type === "tool_failed") {
          const s = steps.find((x) => x.id === ev.stepId);
          if (s) {
            s.status = "failed";
            s.error = ev.error;
          }
        }
      });

      const result = await run.wait();
      return sendJson(req, res, 200, {
        deck: result.deck,
        versionId: result.versionId,
        versionNumber: result.versionNumber,
        versionLabel: result.versionLabel,
        summary: result.summary,
        steps: result.steps?.length ? result.steps : steps,
        pinBatch: result.pinBatch,
        provider: provider.id,
        displayName: provider.displayName,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/export-pptx") {
      const body = await readBody(req);
      if (!body.deck) return sendJson(req, res, 400, { error: "deck required" });
      const exp = await loadExporter();
      const out = await exp.exportDeckToArrayBuffer(body.deck, {
        filename: body.filename,
      });
      const buf = Buffer.from(out.data);
      res.writeHead(200, {
        "Content-Type": out.mimeType,
        "Content-Disposition": `attachment; filename="${out.filename}"`,
        ...corsHeaders(req),
        "X-Export-Report": Buffer.from(
          JSON.stringify({
            degradations: out.report.degradations?.length ?? 0,
            nativeCoverage: out.report.nativeCoverage,
            fullyNative: out.report.fullyNative,
          }),
        ).toString("base64url"),
      });
      res.end(buf);
      return;
    }

    sendJson(req, res, 404, { error: "not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api]", message);
    sendJson(req, res, 500, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`DSH SlideStudio API http://${HOST}:${PORT}`);
  console.log(`  GET  /api/health`);
  console.log(`  POST /api/generate   { prompt, modelId? }`);
  console.log(`  POST /api/export-pptx { deck }`);
});
