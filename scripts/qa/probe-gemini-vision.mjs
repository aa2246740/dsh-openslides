#!/usr/bin/env node
/**
 * Prove whether the configured Gemini chat model can read an image_url.
 * Never prints secrets. Writes notes + the probe PNG under QA_OUT.
 */
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { createLlmPort, llmConfigFromEnv } from "../../packages/agent-harness/dist/llm-port.js";
import { loadRootEnv, ROOT } from "./load-env.mjs";

loadRootEnv();

const OUT = process.env.QA_GEMINI_VISION_OUT || "/opt/cursor/artifacts/qa-gemini-vision";
const TOKEN = "AQUA-42";
fs.mkdirSync(OUT, { recursive: true });

const notes = {
  startedAt: new Date().toISOString(),
  currentModel: process.env.SLIDESTUDIO_LLM_MODEL || null,
  baseHost: null,
  probes: [],
  switchedTo: null,
  errors: [],
};

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

async function paintTokenPng() {
  const dest = path.join(OUT, "probe-token.png");
  const browser = await launchPinnedChromium({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 480, height: 200 } });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#0b3d2e;display:flex;align-items:center;justify-content:center;height:100vh;width:100vw">
      <div style="font:700 72px/1 ui-sans-serif,system-ui;color:#7CFFB2;letter-spacing:2px">${TOKEN}</div>
    </body></html>`,
  );
  await page.screenshot({ path: dest, type: "png" });
  await browser.close();
  return dest;
}

async function probeModel(model, dataUrl) {
  const cfg = llmConfigFromEnv();
  if (!cfg) {
    return { model, ok: false, error: "SLIDESTUDIO_LLM_BASE_URL missing" };
  }
  const port = createLlmPort({ ...cfg, model, timeoutMs: 60_000, retry: { maxRetries: 1 } });
  if (!port.completeTurn) {
    return { model, ok: false, error: "completeTurn missing" };
  }
  const started = Date.now();
  try {
    const turn = await port.completeTurn([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Read the unique token painted on this PNG. Reply with only that token. No punctuation.",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ]);
    const text = String(turn.content || "").trim();
    const saw = text.includes(TOKEN);
    return {
      model,
      ok: saw,
      ms: Date.now() - started,
      reply: text.slice(0, 200),
      sawToken: saw,
    };
  } catch (err) {
    return {
      model,
      ok: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400),
    };
  }
}

function upsertEnvModel(model) {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, "utf8");
  if (/^SLIDESTUDIO_LLM_MODEL=/m.test(text)) {
    text = text.replace(/^SLIDESTUDIO_LLM_MODEL=.*$/m, `SLIDESTUDIO_LLM_MODEL=${model}`);
  } else {
    if (!text.endsWith("\n")) text += "\n";
    text += `SLIDESTUDIO_LLM_MODEL=${model}\n`;
  }
  fs.writeFileSync(file, text, "utf8");
}

const cfg = llmConfigFromEnv();
if (!cfg) {
  notes.errors.push("no LLM config");
} else {
  notes.baseHost = hostOf(cfg.baseUrl);
}

const png = await paintTokenPng();
const dataUrl = `data:image/png;base64,${fs.readFileSync(png).toString("base64")}`;
const current = process.env.SLIDESTUDIO_LLM_MODEL?.trim() || "gemini-3.5-flash-lite";
const preferred = "gemini-3.5-flash";
const models = [current];
if (preferred !== current) models.push(preferred);

for (const model of models) {
  const result = await probeModel(model, dataUrl);
  notes.probes.push(result);
}

const flash = notes.probes.find((p) => p.model === preferred);
const cur = notes.probes.find((p) => p.model === current);
if (flash?.ok && current !== preferred) {
  upsertEnvModel(preferred);
  notes.switchedTo = preferred;
  notes.switchReason = "Free-tier Flash saw the probe token; use it as the main multimodal chat model.";
} else if (cur?.ok) {
  notes.switchedTo = null;
  notes.switchReason = `${current} already saw the probe token.`;
} else {
  notes.errors.push("No probed Gemini model read the painted token. Vision is advertised only if a later run succeeds.");
}

fs.writeFileSync(path.join(OUT, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
console.log(JSON.stringify(notes, null, 2));
process.exit(notes.errors.length ? 1 : 0);
