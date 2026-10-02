#!/usr/bin/env node
/**
 * Product path: existing product login → exact provider → Pi + skills → real deck.
 * Does not import a legacy host key or mutate the user's provider auth.
 */
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import { ROOT, restartNativeWebServer } from "./gestures.mjs";
import { loadRootEnv } from "./load-env.mjs";
import { requireExternalModelConsent } from "./external-model-consent.mjs";

loadRootEnv();
delete process.env.SLIDESTUDIO_PI_AUTH_PATH;

const OUT = process.env.QA_PI_SKILL_OUT || path.join(ROOT, "output", "qa-pi-skill");
const ART = process.env.QA_PI_SKILL_ART || "/opt/cursor/artifacts/qa-pi-skill";
const BASE = process.env.BASE || "http://127.0.0.1:55200";
const BRIEF = "介绍一下勾股定理，面向小学生";
const PROVIDER = process.env.QA_PI_PROVIDER || "google";
const MODEL = process.env.QA_PI_MODEL || process.env.SLIDESTUDIO_QA_PI_MODEL || "";

const modelConsent = requireExternalModelConsent({
  script: "record-pi-skill-generate",
  brief: BRIEF,
});

fs.mkdirSync(OUT, { recursive: true });

const notes = {
  startedAt: new Date().toISOString(),
  errors: [],
  auth: null,
  provider: PROVIDER,
  model: MODEL,
  generate: null,
  modelConsent,
};

function publicAuth(data) {
  return {
    ok: data.ok,
    auth: data.auth,
    stored: data.stored,
    oauthAvailable: data.oauthAvailable,
  };
}

await restartNativeWebServer();
notes.auth = publicAuth(await fetch(`${BASE}/api/pi/auth`).then((r) => r.json()));
if (!notes.auth.stored?.some((row) => row.providerId === PROVIDER)) {
  notes.errors.push(`selected provider is not logged in: ${PROVIDER}`);
}

const browser = await launchPinnedChromium({
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,900"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(`${BASE}/hub.html`, { waitUntil: "networkidle" });
  await page.click("#btn-model");
  await page.waitForSelector("#pi-panel:not([hidden])", { timeout: 8000 });
  await page.selectOption("#pi-provider", PROVIDER);
  if (MODEL) await page.fill("#pi-model", MODEL);
  await page.screenshot({ path: path.join(OUT, "01-hub-provider.png") });
} catch (err) {
  notes.errors.push(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

if (!notes.errors.length) {
  const res = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brief: BRIEF,
      design: "consulting/pine-green-strategy",
      category: "All",
      kind: "Slides",
      layout: "16:9",
      model: "Pi",
      piProvider: PROVIDER,
      piModel: MODEL || undefined,
      stream: true,
    }),
  });
  if (res.status === 401 || res.status === 400) {
    const body = await res.json().catch(() => ({}));
    notes.errors.push(`generate refused: ${res.status} ${body.error || ""}`);
  } else {
    let done = null;
    let buf = "";
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === "done" || ev.type === "error") done = ev;
        } catch {
          /* ignore */
        }
      }
    }
    notes.generate = {
      status: res.status,
      ok: done?.ok,
      error: done?.error,
      composeSource: done?.composeSource,
      usedPi: done?.usedPi,
      fallbackReason: done?.fallbackReason,
      path: done?.path,
      steps: (done?.steps || []).map((s) => ({
        tool: s.tool,
        label: s.label,
        status: s.status,
        summary: s.summary,
      })),
    };
    if (done?.path) {
      const traceFile = path.join(done.path, "_agent", "pi-trace.json");
      const skillFile = path.join(done.path, "_agent", "skill-deck.json");
      const pathsFile = path.join(done.path, "_agent", "skill-paths.md");
      const deckFile = path.join(done.path, "deck.pptd");
      notes.generate.disk = {
        hasTrace: fs.existsSync(traceFile),
        hasSkillDeck: fs.existsSync(skillFile),
        hasSkillPaths: fs.existsSync(pathsFile),
        hasDeck: fs.existsSync(deckFile),
      };
      if (fs.existsSync(traceFile)) {
        const trace = JSON.parse(fs.readFileSync(traceFile, "utf8"));
        notes.generate.trace = {
          usedPi: trace.usedPi,
          produce: trace.produce,
          produceKind: trace.produceKind,
          skills: trace.skills,
          events: trace.events,
          model: trace.model,
          provider: trace.provider,
        };
      }
      if (fs.existsSync(deckFile)) {
        const pagesDir = path.join(done.path, "pages");
        notes.generate.pageCount = fs.existsSync(pagesDir)
          ? fs.readdirSync(pagesDir).filter((f) => f.endsWith(".page")).length
          : 0;
      }
    }
    if (done?.composeSource !== "pi-rpc" || !done?.usedPi) {
      notes.errors.push(
        `not a Pi+skill generate: ${JSON.stringify({
          composeSource: done?.composeSource,
          usedPi: done?.usedPi,
          fallbackReason: done?.fallbackReason,
        })}`,
      );
    }
  }
}

notes.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
try {
  fs.mkdirSync(ART, { recursive: true });
  for (const name of fs.readdirSync(OUT)) {
    if (name === "auth.json") continue;
    fs.copyFileSync(path.join(OUT, name), path.join(ART, name));
  }
} catch {
  /* ignore */
}
console.log(JSON.stringify({
  errors: notes.errors,
  afterLogin: notes.afterLogin?.auth || null,
  generate: notes.generate,
  out: OUT,
}, null, 2));
if (notes.errors.length) process.exitCode = 1;
