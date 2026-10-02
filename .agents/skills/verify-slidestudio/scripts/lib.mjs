// Shared harness for the verify-slidestudio skill.
//
// One long-lived editor server per run (apps/native-web/src/server.mjs on a free
// port), an in-process fake DSH kernel so Hub/launch pages can boot without
// credentials, one scratch deck per feature, and an evidence directory that
// cleanup never touches.
//
// Nothing here starts, stops or reads the user's real stack on 55200/13080.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const { launchPinnedChromium } = await import(
  pathToFileURL(path.join(REPO, "scripts/lib/pinned-playwright.mjs")).href
);
const yamlMod = await import(pathToFileURL(path.join(REPO, "node_modules/yaml/dist/index.js")).href);
export const YAML = yamlMod.default ?? yamlMod;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });

// ---------------------------------------------------------------- fake kernel
const SHA = "a".repeat(64);
export const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
export const TEST_CATALOG = {
  version: 1,
  hash: SHA,
  formats: [
    { kind: "Slides", layout: "16:9" },
    { kind: "Slides", layout: "4:3" },
  ],
  styles: [
    {
      id: "work/plain",
      label: "Plain",
      category: "work",
      designSourceId: "ds-plain",
      designHash: SHA,
      previews: [
        { sourceId: "pv-plain", hash: SHA, order: 0, url: `/slides/catalog/previews/${encodeURIComponent("pv-plain")}` },
      ],
    },
  ],
};

/**
 * Minimal in-process stand-in for the DSH kernel. It answers the boot probes the
 * Hub and editor fire on load. It never generates anything: model output needs a
 * real provider and is out of scope for this skill.
 */
async function startFakeKernel() {
  const seen = [];
  const kernel = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    seen.push(`${req.method} ${p}`);
    const send = (obj, type = "application/json", raw = false) => {
      res.writeHead(200, { "content-type": type });
      res.end(raw ? obj : JSON.stringify(obj));
    };
    if (p === "/slides/catalog") return send(TEST_CATALOG);
    if (p.startsWith("/slides/catalog/previews/")) return send(PIXEL_PNG, "image/png", true);
    if (p === "/slides/health")
      return send({
        ok: true,
        product: "DSH SlideStudio",
        generateReady: true,
        selection: { providerId: "test", model: "cheap", ready: true },
        connection: { ready: true },
        capability: {
          research: { configured: true, via: "native" },
          imageSearch: { configured: false },
          imageGenerate: { configured: false },
          vision: { mode: "main-model" },
          render: true,
        },
        catalog: {},
        providers: [],
      });
    if (p === "/slides/providers")
      return send({ providers: [{ id: "test", name: "Local", ready: true, models: ["cheap"] }], connection: { ready: true } });
    if (p === "/slides/models")
      return send([{ providerId: "test", providerName: "Local", ready: true, models: [{ id: "cheap", name: "cheap", inputModalities: ["text", "image"] }], modelEfforts: { cheap: [] } }]);
    if (p === "/slides/tool-settings") return send({ ok: true, settings: {} });
    if (p.startsWith("/plugins/")) return send({ ok: true, status: "signed-out", providers: [] });
    return send({ ok: true });
  });
  const port = await new Promise((r) => kernel.listen(0, "127.0.0.1", () => r(kernel.address().port)));
  return { port, kernel, seen };
}

/**
 * Copy a fixture without its runtime state. `.versions/` and `_agent/` are git-ignored
 * leftovers of whoever last ran the editor on the checked-in fixture (possibly the user's
 * live session), so a scratch deck must never inherit them.
 */
function copyFixture(fixture, dest) {
  fs.cpSync(path.join(REPO, "fixtures", fixture), dest, {
    recursive: true,
    filter: (src) => !/[\\/](\.versions|_agent)([\\/]|$)/.test(src),
  });
}

// ------------------------------------------------------------------- the run
/**
 * Start a run. Returns a context with everything a driver needs.
 *   ctx.base           editor origin
 *   ctx.evidenceDir    kept after cleanup
 *   ctx.deck(name)     fresh scratch copy of a fixture, returns its abs path
 *   ctx.stop()         kills only the processes this run started
 */
export async function startRun({ runId = new Date().toISOString().replace(/[:.]/g, "-"), evidenceRoot } = {}) {
  const evidenceDir = evidenceRoot ?? path.join(REPO, "output/qa-verify-slidestudio", runId);
  const scratchRoot = path.join(REPO, "output", `verify-${runId}`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(scratchRoot, { recursive: true });

  const fake = await startFakeKernel();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const seedDeck = path.join(scratchRoot, "_default");
  copyFixture("okp-yu7-ppt", seedDeck);
  const logFile = path.join(evidenceDir, "server.log");
  const log = fs.openSync(logFile, "w");
  const env = {
    ...process.env,
    PORT: String(port),
    OPEN_SLIDESTUDIO_PROJECT: seedDeck,
    SLIDESTUDIO_RETENTION_DAYS: "0",
    SLIDES_DSH_PORT: String(fake.port),
  };
  const server = spawn(process.execPath, ["apps/native-web/src/server.mjs"], {
    cwd: REPO,
    env,
    stdio: ["ignore", log, log],
  });
  const ctx = {
    runId,
    base,
    port,
    server,
    fake,
    evidenceDir,
    scratchRoot,
    logFile,
    browser: null,
    tracked: [],
    /**
     * A scratch project directly under output/, the only place the Hub's project list scans and
     * the only place DELETE /api/projects will remove. Named verify-<run>-<name> so it can never
     * be mistaken for user work; stop() removes whatever the driver left behind.
     */
    outputProject(name, title) {
      const dir = path.join(REPO, "output", `verify-${runId}-${name}`);
      fs.rmSync(dir, { recursive: true, force: true });
      copyFixture("okp-yu7-ppt", dir);
      if (title) {
        const file = path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".pptd")));
        fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^title:.*$/m, `title: ${title}`));
      }
      ctx.tracked.push(dir);
      return dir;
    },
    deck(name, fixture = "okp-yu7-ppt") {
      const dir = path.join(scratchRoot, name);
      fs.rmSync(dir, { recursive: true, force: true });
      copyFixture(fixture, dir);
      return dir;
    },
    async doctor() {
      try {
        const r = await fetch(`${base}/api/health`);
        const j = await r.json();
        return { ok: r.ok && j.product === "DSH SlideStudio", body: j };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    async stop() {
      try {
        await ctx.browser?.close();
      } catch {}
      if (server.exitCode === null) {
        const done = new Promise((r) => server.once("exit", r));
        server.kill("SIGTERM");
        await Promise.race([done, sleep(3000)]);
        if (server.exitCode === null) server.kill("SIGKILL");
      }
      await new Promise((r) => fake.kernel.close(r));
      fs.rmSync(scratchRoot, { recursive: true, force: true });
      for (const dir of ctx.tracked) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  for (let i = 0; i < 100; i++) {
    if ((await ctx.doctor()).ok) break;
    await sleep(100);
  }
  const d = await ctx.doctor();
  if (!d.ok) {
    await ctx.stop();
    throw new Error(`editor did not become healthy: ${JSON.stringify(d)}`);
  }
  ctx.browser = await launchPinnedChromium({ headless: true });
  return ctx;
}

// -------------------------------------------------------------- per-feature IO
/** A feature recorder: checks, screenshots and browser errors under one name. */
export function recorder(ctx, id) {
  const dir = path.join(ctx.evidenceDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const rec = {
    id,
    dir,
    checks: [],
    gaps: [],
    notes: [],
    errors: [],
    check(name, ok, detail) {
      rec.checks.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 400) });
      return !!ok;
    },
    note(text) {
      rec.notes.push(text);
    },
    /**
     * A product behaviour the map says should work but does not. Reported loudly and kept out of
     * the pass/fail count so the skill still runs green; when the product is fixed the gap flips to
     * "resolved" and the check should be promoted to a normal rec.check.
     */
    gap(name, ok, detail) {
      rec.gaps.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 400) });
      return !!ok;
    },
    async shot(page, name) {
      const file = path.join(dir, `${name}.png`);
      await page.screenshot({ path: file });
      return file;
    },
    json(name, value) {
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(value, null, 2));
    },
    commands: [],
    pages: [],
    watch(page) {
      rec.pages.push(page);
      page.on("pageerror", (e) => rec.errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") rec.errors.push(`console.error: ${m.text()}`);
      });
      page.on("request", (r) => {
        if (r.method() !== "POST" || !r.url().includes("/api/command")) return;
        try {
          rec.commands.push(r.postDataJSON()?.cmd ?? "?");
        } catch {
          rec.commands.push("?");
        }
      });
    },
    /** Poll a disk/DOM predicate: the server answers before every write is visible to a follow-up read. */
    async until(fn, timeout = 3000) {
      const end = Date.now() + timeout;
      let last;
      while (Date.now() < end) {
        try {
          last = await fn();
          if (last) return last;
        } catch {}
        await sleep(80);
      }
      return false;
    },
  };
  return rec;
}

export async function newPage(ctx, rec, viewport = { width: 1440, height: 900 }, opts = {}) {
  // Drivers assert the zh UI: pin the page locale so resolveLang() picks zh
  // instead of headless Chromium's default en-US.
  const context = await ctx.browser.newContext({ viewport, acceptDownloads: true, locale: "zh-CN", ...opts });
  const page = await context.newPage();
  rec.watch(page);
  page.__context = context;
  return page;
}

// ------------------------------------------------------------------ editor io
export const editorUrl = (ctx, deck, extra = "") =>
  `${ctx.base}/index.html?project=${encodeURIComponent(deck)}${extra}`;

/** Open a deck in the editor and wait until the cover lifted and the slide painted. */
export async function openEditor(page, ctx, deck, extra = "") {
  await page.goto(editorUrl(ctx, deck, extra), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const t = document.getElementById("doc-title")?.textContent;
    return t && t !== "未加载";
  });
  await page.waitForSelector("#workspace-cover", { state: "hidden", timeout: 10000 }).catch(() => {});
  await page.waitForSelector("#slide .el[data-id]", { timeout: 10000 });
  await sleep(200);
}

/**
 * Wait for the POST /api/command whose body has `cmd`. Call BEFORE the action.
 * Resolves once the page has had time to repaint from the answer: the response headers arrive before the
 * page reads the body and rerenders, so reading the DOM right after them saw the old state on a busy machine.
 */
export async function waitForCommand(page, cmd, timeout = 8000) {
  const response = await page.waitForResponse(
    (r) => {
      if (!r.url().includes("/api/command") || r.request().method() !== "POST") return false;
      try {
        return r.request().postDataJSON()?.cmd === cmd;
      } catch {
        return false;
      }
    },
    { timeout },
  );
  await response.finished().catch(() => {});
  await page
    .evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60)))))
    .catch(() => {});
  return response;
}

export const listPages = (deck) =>
  fs.readdirSync(path.join(deck, "pages")).filter((f) => f.endsWith(".page")).sort();
export const manifestPath = (deck) => path.join(deck, fs.readdirSync(deck).find((f) => f.endsWith(".pptd")));
export const readManifest = (deck) => YAML.parse(fs.readFileSync(manifestPath(deck), "utf8"));
export const readPageFile = (deck, rel) => YAML.parse(fs.readFileSync(path.join(deck, rel), "utf8"));
export const pageRel = (deck, index) => readManifest(deck).pages[index];
export const readPageAt = (deck, index) => readPageFile(deck, pageRel(deck, index));
export const rawPageAt = (deck, index) => fs.readFileSync(path.join(deck, pageRel(deck, index)), "utf8");

/** sha1 of every file under `dir`, for "nothing changed on disk" checks. */
export function snapshotDir(dir, skip = /(^|\/)(\.versions|_agent)(\/|$)/) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      const rel = path.relative(dir, abs);
      if (skip.test(rel)) continue;
      if (e.isDirectory()) walk(abs);
      else out[rel] = crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");
    }
  };
  walk(dir);
  return out;
}
export const sameSnapshot = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------ kernel-less page
/** Catch-all for /slides and /plugins routes when a page is driven without the fake kernel. */
export async function stubKernelRoutes(page) {
  await page.route("**/plugins/**", (r) => r.fulfill({ json: { ok: true, status: "signed-out", providers: [] } }));
  await page.route("**/slides/catalog/previews/**", (r) => r.fulfill({ contentType: "image/png", body: PIXEL_PNG }));
  await page.route("**/slides/**", (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === "/slides/catalog") return r.fulfill({ json: TEST_CATALOG });
    if (p === "/slides/health")
      return r.fulfill({
        json: {
          ok: true,
          product: "DSH SlideStudio",
          generateReady: true,
          selection: { providerId: "test", model: "cheap", ready: true },
          connection: { ready: true },
          capability: {
            research: { configured: true, via: "native" },
            imageSearch: { configured: false },
            imageGenerate: { configured: false },
            vision: { mode: "main-model" },
            render: true,
          },
          catalog: {},
          providers: [],
        },
      });
    if (p === "/slides/models")
      return r.fulfill({ json: [{ providerId: "test", providerName: "Local", ready: true, models: [{ id: "cheap", name: "cheap", inputModalities: ["text"] }], modelEfforts: { cheap: [] } }] });
    if (p === "/slides/tool-settings") return r.fulfill({ json: { ok: true, settings: {} } });
    return r.fulfill({ json: { ok: true } });
  });
}

/**
 * A fake DSH session bound to the editor at the outer provider boundary, the same
 * shape assistant-composer-dom.test.mjs and stop-continue-dom.test.mjs use. Nothing
 * here is model output: replies are canned strings the test wrote.
 */
export async function fakeSession(page, { sessionId = "verify-session", project, pageCount = 8, pagePaths = [] } = {}) {
  const s = {
    sessionId,
    busy: false,
    phase: "complete",
    intent: { intent: "discuss", scope: "current", pages: [] },
    intentFail: null,
    turnFail: null,
    answerFail: null,
    onTurn: null,
    plans: [],
    turns: [],
    stops: [],
    answers: [],
    questions: [],
    providers: [{ id: "test", name: "Local", ready: true, models: ["model-a", "model-b"] }],
    current: {
      ok: true,
      sessionId,
      brief: "verify",
      phase: "complete",
      agentStatus: "idle",
      provider: { providerId: "test", modelId: "model-a" },
      project: { path: project, title: "Verify", pageCount, pagePaths },
      stages: [],
      inspection: { pages: [] },
      events: [],
      conversation: { version: 1, mode: "generate", messages: [] },
    },
    reply(text) {
      s.current.events.push({
        id: `a${s.current.events.length}`,
        kind: "message",
        at: new Date().toISOString(),
        detail: text,
        status: "complete",
      });
    },
  };
  await stubKernelRoutes(page);
  await page.route("**/api/generation-activity**", (r) => {
    s.current.phase = s.phase;
    s.current.agentStatus = s.busy ? "busy" : "idle";
    return r.fulfill({ json: s.current });
  });
  await page.route("**/slides/providers", (r) => r.fulfill({ json: { providers: s.providers } }));
  await page.route("**/slides/models", (r) => r.fulfill({ json: s.providers.filter((p) => p.ready).map((p) => ({
    providerId: p.id, providerName: p.name, ready: true,
    models: p.models.map((id) => ({ id, name: id, inputModalities: ["text"] })),
    modelEfforts: Object.fromEntries(p.models.map((id) => [id, []])),
  })) }));
  await page.route(`**/slides/state/${sessionId}`, (r) =>
    r.fulfill({
      json: {
        agentStatus: s.busy ? "busy" : "idle",
        binding: { dshSessionId: sessionId },
        phase: { kind: s.phase },
        questions: s.questions,
      },
    }),
  );
  await page.route(`**/slides/sessions/${sessionId}/events`, (r) => r.abort());
  await page.route("**/slides/assistant-intent", async (r) => {
    s.plans.push(r.request().postDataJSON());
    if (s.intentFail) return r.fulfill({ status: 503, json: { error: s.intentFail } });
    return r.fulfill({ json: { ok: true, ...s.intent } });
  });
  await page.route(`**/slides/sessions/${sessionId}/turn`, async (r) => {
    const body = r.request().postDataJSON();
    s.turns.push(body);
    if (s.turnFail) return r.fulfill({ status: 500, json: { ok: false, error: s.turnFail } });
    const n = s.turns.length;
    s.current.conversation.messages.push({
      id: `u${n}`,
      at: new Date(Date.now() - 500).toISOString(),
      text: body.userText ?? body.text,
      mode: body.conversationMode ?? "discuss",
    });
    s.reply(`**回复 ${n}**：已收到（这是 verify 桩，不是模型输出）。`);
    s.onTurn?.(body);
    return r.fulfill({ json: { ok: true, userMessage: s.current.conversation.messages.at(-1) } });
  });
  await page.route(`**/slides/sessions/${sessionId}/stop`, (r) => {
    s.stops.push(r.request().headers()["content-type"] ?? "");
    s.busy = false;
    s.phase = "paused";
    return r.fulfill({ json: { ok: true, stopped: true } });
  });
  await page.route(`**/slides/sessions/${sessionId}/questions/*`, (r) => {
    if (s.answerFail) {
      const error = s.answerFail;
      s.answerFail = null;
      return r.fulfill({ status: 503, json: { ok: false, error } });
    }
    const body = r.request().postDataJSON();
    s.answers.push(body);
    const row = s.questions.find((q) => r.request().url().endsWith(q.id));
    if (row) {
      row.status = body.action === "answer" ? "answered" : "cancelled";
      row.answer = body.answer;
    }
    return r.fulfill({ json: { ok: true } });
  });
  return s;
}

// ---------------------------------------------------------------------- zips
import { createRequire } from "node:module";
const require = createRequire(path.join(REPO, "package.json"));
export async function unzipEntries(file) {
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  return zip;
}
