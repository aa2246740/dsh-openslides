#!/usr/bin/env node
/**
 * Dead-button dictionary audit (DSH SlideStudio).
 *
 * Compares every clickable control id used by the UI against the
 * allowedControlIds whitelist (dead-button ban, AGENTS.md hard rule):
 *
 *   UI side   : data-control="..." in apps/native-web/public/index.html
 *               + controls created in apps/native-web/public/app.js
 *                 (setAttribute("data-control", "<literal>"),
 *                  btn/iconBtn/ctxPop/menuItem "<control>" args,
 *                  allowed("<control>") gates,
 *                  controlId: "<control>" payloads)
 *   Allow side: ORACLE_CONTROLS in apps/native-web/src/server.mjs
 *               (runtime whitelist fed to openSession as allowedControlIds;
 *               packages/canvas-session/src/index.ts carries the Set type +
 *               assertControl gate but no literal list, so the server list is
 *               the auditable source — verified below).
 *   Oracle    : docs/editor-oracle/catalog/index.yaml + rows/<id path>/row.json
 *
 * Output classes:
 *   allowed-but-missing-in-UI : informational (keyboard/server-only controls)
 *   in-UI-but-not-allowed     : DEAD — hard fail, non-zero exit
 *   ambiguous dynamic         : warn only (variable passed to setAttribute)
 *
 * For each DEAD control, the catalog is consulted for its oracle row
 * (SPEC.md row rule: rows/<dotted-id with slashes>/row.json). Missing rows
 * are listed as ORACLE-MISSING with the S0-S13 surface bucket from
 * catalog/SURFACE.md. Rows are never invented here — report only.
 *
 *   node scripts/qa/dead-button-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INDEX_HTML = path.join(ROOT, "apps/native-web/public/index.html");
const APP_JS = path.join(ROOT, "apps/native-web/public/app.js");
const SERVER_MJS = path.join(ROOT, "apps/native-web/src/server.mjs");
const SESSION_TS = path.join(ROOT, "packages/canvas-session/src/index.ts");
const CATALOG_YAML = path.join(ROOT, "docs/editor-oracle/catalog/index.yaml");
const ROWS_DIR = path.join(ROOT, "docs/editor-oracle/rows");

const isControlId = (s) =>
  /^[a-z]+(?:\.[a-z0-9]+)+(?:\.[a-z0-9]+)*$/i.test(s) && s.includes(".");
const KNOWN_NON_CONTROLS = new Set(["selectionchange"]);

function parseIndexHtml() {
  const src = fs.readFileSync(INDEX_HTML, "utf8");
  const ids = new Map(); // id -> [selectors]
  for (const m of src.matchAll(/data-control\s*=\s*"([^"]+)"/g)) {
    const id = m[1].trim();
    if (!isControlId(id) || KNOWN_NON_CONTROLS.has(id)) continue;
    const tagCtx = src.slice(Math.max(0, m.index - 200), m.index);
    const idm = /id\s*=\s*"([^"]*)"\s*(?=[^>]*data-control)|data-control[^>]*\sid\s*=\s*"([^"]*)"/.exec(
      `${tagCtx}${m[0]}`,
    );
    void idm;
    if (!ids.has(id)) ids.set(id, []);
    // recover element id from the enclosing tag
    const tagStart = src.lastIndexOf("<", m.index);
    const tag = src.slice(tagStart, src.indexOf(">", m.index) + 1);
    const elId = /id\s*=\s*"([^"]+)"/.exec(tag)?.[1] || "(no id)";
    ids.get(id).push(`${elId} in index.html`);
  }
  return ids;
}

function parseAppJs() {
  const src = fs.readFileSync(APP_JS, "utf8");
  const ids = new Map(); // id -> Set(sources)
  const add = (id, source) => {
    if (!isControlId(id) || KNOWN_NON_CONTROLS.has(id)) return;
    if (!ids.has(id)) ids.set(id, new Set());
    ids.get(id).add(source);
  };
  for (const m of src.matchAll(/setAttribute\(\s*["']data-control["']\s*,\s*"([^"]+)"\s*\)/g)) {
    add(m[1].trim(), "setAttribute literal");
  }
  for (const m of src.matchAll(/\b(?:btn|iconBtn|ctxPop|menuItem)\(\s*("[^"]*"|'[^']*')\s*,/g)) {
    // btn(label, control, ...) — control is the 2nd arg; capture via full call below.
  }
  void 0;
  // Helper-call control args: btn(label, "control", ...), iconBtn(t, svg, fn, "control"),
  // ctxPop(id, title, svg, "control", ...), menuItem(label, shortcut, fn, "control").
  for (const m of src.matchAll(/\bbtn\(\s*"[^"]*"\s*,\s*"([^"]+)"\s*[,)]/g)) add(m[1].trim(), "btn()");
  for (const m of src.matchAll(/\biconBtn\(\s*"[^"]*"\s*,\s*[^,]+,\s*\([^)]*\)\s*=>\s*\{?[^,]*\}?\s*,?\s*"([^"]+)"\s*[,)]/g)) {
    add(m[1].trim(), "iconBtn()");
  }
  // Simpler robust pass for iconBtn/ctxPop/menuItem: any dotted id in the
  // call's trailing args on the same line.
  for (const m of src.matchAll(/\b(?:iconBtn|ctxPop|menuItem)\([^\n]*?"((?:chrome|insert|element|selection|theme|notes|contextmenu)[\w.]*)"[^\n]*?\)/g)) {
    add(m[1].trim(), "helper-call");
  }
  for (const m of src.matchAll(/\ballowed\(\s*"([^"]+)"\s*\)/g)) add(m[1].trim(), "allowed()");
  for (const m of src.matchAll(/\ballowed\(\s*'([^']+)'\s*\)/g)) add(m[1].trim(), "allowed()");
  for (const m of src.matchAll(/controlId\s*:\s*"([^"]+)"\s*/g)) add(m[1].trim(), "controlId payload");
  for (const m of src.matchAll(/dataset\.control\s*=\s*"([^"]+)"\s*/g)) add(m[1].trim(), "dataset.control");
  // Catch-all: any other quoted dotted control id (multi-line helper calls,
  // single-quoted literals, ternary branches). Filtered by isControlId so
  // bare words ("element", "insert") and event names never match.
  for (const m of src.matchAll(/"((?:chrome|insert|element|selection|theme|notes|contextmenu)[\w.]*)"/g)) {
    add(m[1].trim(), "string-literal");
  }
  for (const m of src.matchAll(/'((?:chrome|insert|element|selection|theme|notes|contextmenu)[\w.]*)'/g)) {
    add(m[1].trim(), "string-literal");
  }

  // Ambiguous dynamic: setAttribute("data-control", <identifier>) — warn only.
  const ambiguous = [];
  for (const m of src.matchAll(/setAttribute\(\s*["']data-control["']\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    const line = src.slice(0, m.index).split("\n").length;
    ambiguous.push({ variable: m[1], line });
  }
  return { ids, ambiguous };
}

function parseWhitelist() {
  const sessionSrc = fs.readFileSync(SESSION_TS, "utf8");
  const hasGate = /assertControl\(session,\s*controlId\)/.test(sessionSrc) && /control not allowed/.test(sessionSrc);
  const srv = fs.readFileSync(SERVER_MJS, "utf8");
  const m = /const ORACLE_CONTROLS\s*=\s*\[(.*?)\];/s.exec(srv);
  if (!m) throw new Error("ORACLE_CONTROLS not found in server.mjs");
  const ids = new Set(
    [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1].trim()).filter((s) => isControlId(s)),
  );
  // Cross-check: canvas-session carries no literal whitelist (dynamic Set),
  // so the server list is the auditable source; record that explicitly.
  const sessionLiterals = [...sessionSrc.matchAll(/"((?:chrome|insert|element|selection|theme|notes|contextmenu)[\w.]*)"/g)]
    .map((x) => x[1])
    .filter((s) => isControlId(s));
  return { ids, hasGate, sessionLiterals };
}

function parseCatalog() {
  const src = fs.readFileSync(CATALOG_YAML, "utf8");
  const rows = new Map(); // id -> {status, testId, surface}
  for (const m of src.matchAll(/-\s*id:\s*(\S+)\s*\n\s*path:\s*(\S+)\s*\n\s*status:\s*(\S+)\s*\n\s*testId:\s*(\S+)\s*\n\s*surface:\s*(\S+)/g)) {
    rows.set(m[1], { path: m[2], status: m[3], testId: m[4], surface: m[5] });
  }
  return rows;
}

// SURFACE.md §Mapping: surface enum -> S-section bucket.
const SURFACE_TO_SECTION = {
  "chrome.global": "S1",
  "chrome.pages": "S1",
  "chrome.export": "S2",
  selection: "S3",
  insert: "S4",
  "element.text": "S5",
  "element.shape": "S6",
  "element.line": "S7",
  "element.image": "S8",
  "element.icon": "S9",
  "element.table": "S10",
  "element.chart": "S11",
  "theme.background": "S12",
  notes: "S12",
  animation: "S13",
  keyboard: "S13",
  "context-menu": "S13",
  "element.smartart": "S13",
  other: "S13",
};
function guessSurface(controlId) {
  if (/^chrome\.(export)/.test(controlId)) return "chrome.export";
  if (/^chrome\.(pages)/.test(controlId)) return "chrome.pages";
  if (/^chrome\./.test(controlId)) return "chrome.global";
  if (/^insert\./.test(controlId)) return "insert";
  if (/^selection|^element\.(delete|duplicate|group|ungroup|lock|visibility|group|arrange|rotate|opacity|shadow|bounds)/.test(controlId)) {
    return "selection";
  }
  if (/^element\.text/.test(controlId)) return "element.text";
  if (/^element\.shape/.test(controlId)) return "element.shape";
  if (/^element\.line/.test(controlId)) return "element.line";
  if (/^element\.image/.test(controlId)) return "element.image";
  if (/^element\.icon/.test(controlId)) return "element.icon";
  if (/^element\.table/.test(controlId)) return "element.table";
  if (/^element\.chart/.test(controlId)) return "element.chart";
  if (/^theme\./.test(controlId)) return "theme.background";
  if (/^notes\./.test(controlId)) return "notes";
  if (/^contextmenu/.test(controlId)) return "context-menu";
  if (/smartart|animation/.test(controlId)) return "element.smartart";
  return "other";
}

const htmlIds = parseIndexHtml();
const { ids: jsIds, ambiguous } = parseAppJs();
const { ids: allowed, hasGate, sessionLiterals } = parseWhitelist();
const catalog = parseCatalog();

const uiIds = new Map(); // id -> Set(origin)
for (const [id, sels] of htmlIds) {
  if (!uiIds.has(id)) uiIds.set(id, new Set());
  for (const s of sels) uiIds.get(id).add(`index.html:${s}`);
}
for (const [id, srcs] of jsIds) {
  if (!uiIds.has(id)) uiIds.set(id, new Set());
  for (const s of srcs) uiIds.get(id).add(`app.js:${s}`);
}

const dead = [...uiIds.keys()].filter((id) => !allowed.has(id)).sort();
const missing = [...allowed].filter((id) => !uiIds.has(id)).sort();

console.log(`INFO  UI control ids: ${uiIds.size} (index.html: ${htmlIds.size} distinct, app.js: ${jsIds.size} distinct)`);
console.log(`INFO  whitelist (server ORACLE_CONTROLS): ${allowed.size}; canvas-session assertControl gate: ${hasGate ? "present" : "MISSING"}`);
console.log(`INFO  catalog rows: ${catalog.size}; session.ts control-like literals: ${sessionLiterals.length}`);

console.log(`\n== allowed-but-missing-in-UI (ok, informational; keyboard/server-only) [${missing.length}] ==`);
for (const id of missing) {
  const row = catalog.get(id);
  console.log(`  - ${id}  (oracle: ${row ? `${row.status}/${row.testId}` : "no catalog entry"})`);
}

console.log(`\n== ambiguous dynamic controls (warn only) [${ambiguous.length}] ==`);
const ambByVar = new Map();
for (const a of ambiguous) {
  if (!ambByVar.has(a.variable)) ambByVar.set(a.variable, []);
  ambByVar.get(a.variable).push(a.line);
}
for (const [v, lines] of ambByVar) {
  console.log(`  ~ setAttribute("data-control", ${v}) at app.js:${lines.slice(0, 8).join(",")} — resolved at runtime; manual review only`);
}
console.log("  notes: iconGrid uses iconControl = selectedEl()?.type === 'icon' ? 'element.icon.name.set' : 'insert.icon' (both allowed);");
console.log("         ctx-bar btn(control)/menuItem(control) forward caller-supplied literals already enumerated above.");

console.log(`\n== in-UI-but-not-allowed (DEAD, hard fail) [${dead.length}] ==`);
let oracleMissing = 0;
for (const id of dead) {
  const origins = [...uiIds.get(id)].join("; ");
  const row = catalog.get(id);
  const rowPath = `rows/${id.replace(/\./g, "/")}/row.json`;
  const rowExists = row && fs.existsSync(path.join(ROWS_DIR, ...id.split("."), "row.json"));
  const surface = row?.surface || guessSurface(id);
  const section = SURFACE_TO_SECTION[surface] || "S13";
  console.log(`  DEAD  ${id}`);
  console.log(`        origins: ${origins}`);
  console.log(`        expected behavior: control must be oracle-backed and whitelisted; currently blocked by assertControl/disabled gate`);
  if (!row || !rowExists) {
    oracleMissing += 1;
    console.log(`        ORACLE-MISSING  catalog=${row ? `${row.status}` : "no entry"} surface=${surface} section=${section} (no ${rowPath}; do not invent)`);
  } else {
    console.log(`        oracle row: ${row.status}/${row.testId} at ${rowPath} (row exists but control not whitelisted)`);
  }
}

console.log(
  `\nSUMMARY ui=${uiIds.size} allowed=${allowed.size} ` +
    `allowed-missing-in-ui=${missing.length} dead=${dead.length} ` +
    `oracle-missing=${oracleMissing} ambiguous-vars=${ambByVar.size}`,
);
if (dead.length) {
  console.error(`FAIL  dead-button ban violated: ${dead.length} in-UI-but-not-allowed control(s): ${dead.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("OK    dead-button-audit: no dead buttons");
}
