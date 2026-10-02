#!/usr/bin/env node
/**
 * P2 QA tail-mine checks (fetch only — no playwright required).
 *
 *   BASE=http://127.0.0.1:55200 node scripts/verify-tail-mines.mjs
 *
 * 1. goToPage 3 + GET /api/model (and /api/open reopen) keeps pageIndex
 * 2. 12 consecutive insert shape → distinct in-canvas origins
 * 3. fuzz every /api/command case with {} → JSON 200/4xx, server stays up, no NaN bounds
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE || "http://127.0.0.1:55200";
const SERVER_SRC = path.join(ROOT, "apps/native-web/src/server.mjs");
const FIXTURE = path.join(ROOT, "fixtures/okp-yu7-ppt");

const fail = [];
const pass = [];
const log = (ok, id, detail) => {
  (ok ? pass : fail).push({ id, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? " — " + detail : ""}`);
};

async function req(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { res, data, text };
}

async function j(url, opts) {
  const { res, data, text } = await req(url, opts);
  if (!res.ok) {
    const err = data && typeof data === "object" ? data.error : text;
    throw new Error(`${res.status} ${err || res.statusText}`);
  }
  return data;
}

function commandNames() {
  const src = fs.readFileSync(SERVER_SRC, "utf8");
  const start = src.indexOf('url.pathname === "/api/command"');
  const end = src.indexOf('url.pathname === "/api/export"', start);
  const chunk = src.slice(start, end > start ? end : undefined);
  return [...new Set([...chunk.matchAll(/case "([^"]+)"/g)].map((m) => m[1]))];
}

function findNaN(value, trail, hits) {
  if (typeof value === "number" && Number.isNaN(value)) hits.push(trail);
  else if (Array.isArray(value)) {
    value.forEach((v, i) => findNaN(v, `${trail}[${i}]`, hits));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) findNaN(v, `${trail}.${k}`, hits);
  }
}

function copyFixture() {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "tail-mines-"));
  fs.cpSync(FIXTURE, dest, { recursive: true });
  return dest;
}

const tmpProj = copyFixture();

try {
  const health0 = await j(`${BASE}/api/health`);
  log(health0.ok === true, "health.up", `project=${health0.project}`);

  const opened = await j(`${BASE}/api/open`, {
    method: "POST",
    body: JSON.stringify({ path: tmpProj }),
  });
  log(Boolean(opened.model), "open.tmp", opened.model?.title);
  const pageCount = opened.model?.pageCount ?? 0;
  log(pageCount > 3, "open.pages", `pageCount=${pageCount}`);

  const gone = await j(`${BASE}/api/command`, {
    method: "POST",
    body: JSON.stringify({ cmd: "goToPage", index: 3 }),
  });
  log(gone.model?.pageIndex === 3, "goto.3", `pageIndex=${gone.model?.pageIndex}`);

  const m1 = await j(`${BASE}/api/model`);
  log(m1.model?.pageIndex === 3, "model.get.1", `pageIndex=${m1.model?.pageIndex}`);
  const m2 = await j(`${BASE}/api/model`);
  log(m2.model?.pageIndex === 3, "model.get.2", `pageIndex=${m2.model?.pageIndex}`);

  const reopened = await j(`${BASE}/api/open`, {
    method: "POST",
    body: JSON.stringify({ path: tmpProj }),
  });
  log(
    reopened.model?.pageIndex === 3,
    "open.reopen.remembers",
    `pageIndex=${reopened.model?.pageIndex}`,
  );
  const m3 = await j(`${BASE}/api/model`);
  log(m3.model?.pageIndex === 3, "model.after.reopen", `pageIndex=${m3.model?.pageIndex}`);

  const sized = await j(`${BASE}/api/model?page=2`);
  log(sized.model?.pageIndex === 2, "model.query.page", `pageIndex=${sized.model?.pageIndex}`);
  const back = await j(`${BASE}/api/open`, {
    method: "POST",
    body: JSON.stringify({ path: tmpProj, page: 3 }),
  });
  log(back.model?.pageIndex === 3, "open.body.page", `pageIndex=${back.model?.pageIndex}`);

  const canvas = back.model?.size || [960, 540];
  const origins = new Set();
  let insertOk = true;
  for (let i = 0; i < 12; i++) {
    const before = new Set((await j(`${BASE}/api/model`)).model.elements.map((e) => e.id));
    const r = await j(`${BASE}/api/command`, {
      method: "POST",
      body: JSON.stringify({ cmd: "insert", kind: "shape" }),
    });
    const added = (r.model?.elements || []).filter((e) => !before.has(e.id));
    if (added.length !== 1) {
      insertOk = false;
      log(false, `insert.${i + 1}`, `added=${added.length}`);
      continue;
    }
    const [x, y, w, h] = added[0].bounds;
    const key = `${x},${y}`;
    const finite = [x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n));
    const inside = x >= 0 && y >= 0 && x + w <= canvas[0] && y + h <= canvas[1];
    const unique = !origins.has(key);
    origins.add(key);
    const ok = finite && inside && unique;
    if (!ok) insertOk = false;
    log(
      ok,
      `insert.${i + 1}`,
      `origin=${key} size=${w}x${h}${unique ? "" : " DUP"}${inside ? "" : " CLIP"}${finite ? "" : " NaN"}`,
    );
  }
  log(origins.size === 12 && insertOk, "insert.12.distinct", `origins=${origins.size}`);

  const cmds = commandNames();
  log(cmds.length >= 20, "fuzz.cmd.list", `n=${cmds.length}`);
  let fuzzOk = true;
  const payloads = [
    ...cmds.map((cmd) => ({ cmd })),
    { cmd: "goToPage", index: "nope" },
    { cmd: "zoom", percent: "nope" },
    { cmd: "reorderPage", fromIndex: {}, toIndex: true },
    { cmd: "setBounds", bounds: { x: 1 } },
    { cmd: "setBounds", bounds: [null, 0, 10, 10] },
  ];
  for (const payload of payloads) {
    const { res, data, text } = await req(`${BASE}/api/command`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const jsonOk = data && typeof data === "object";
    const statusOk = res.status === 200 || (res.status >= 400 && res.status < 500);
    const ok = jsonOk && statusOk;
    if (!ok) fuzzOk = false;
    const label = payload.cmd + (Object.keys(payload).length > 1 ? ".typed" : ".empty");
    if (!ok) {
      log(false, `fuzz.${label}`, `status=${res.status} json=${jsonOk} body=${String(text).slice(0, 80)}`);
    }
  }
  log(fuzzOk, "fuzz.all.json", fuzzOk ? `${payloads.length} payloads` : "see failures above");

  const health1 = await j(`${BASE}/api/health`);
  log(health1.ok === true, "health.after.fuzz", JSON.stringify({ ok: health1.ok, connected: health1.connected }));

  const after = await j(`${BASE}/api/model`);
  const nanHits = [];
  findNaN(after.model, "model", nanHits);
  const boundHits = [];
  for (const el of after.model?.elements || []) {
    const b = el.bounds;
    if (!Array.isArray(b)) continue;
    b.forEach((n, i) => {
      if (typeof n !== "number" || Number.isNaN(n)) boundHits.push(`${el.id}.bounds[${i}]`);
    });
  }
  log(nanHits.length === 0, "model.no.nan", nanHits.slice(0, 6).join(", ") || "clean");
  log(boundHits.length === 0, "bounds.no.nan", boundHits.slice(0, 6).join(", ") || "clean");
} catch (e) {
  log(false, "verify.crash", e instanceof Error ? e.message : String(e));
} finally {
  try {
    await j(`${BASE}/api/open`, {
      method: "POST",
      body: JSON.stringify({ path: FIXTURE, page: 0 }),
    });
  } catch (e) {
    console.warn("restore open fixture:", e instanceof Error ? e.message : e);
  }
  try {
    fs.rmSync(tmpProj, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

const report = {
  base: BASE,
  at: new Date().toISOString(),
  pass: pass.length,
  fail: fail.length,
  failures: fail,
};
console.log(JSON.stringify(report, null, 2));
if (fail.length) process.exit(1);
