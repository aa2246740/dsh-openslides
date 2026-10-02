#!/usr/bin/env node
/**
 * Offline self-test of native editor API + catalog (no official iframe).
 * Usage: BASE=http://127.0.0.1:55200 node scripts/verify-native-editor.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE || "http://127.0.0.1:55200";
const catalog = parseYaml(fs.readFileSync(path.join(ROOT, "docs/editor-oracle/catalog/index.yaml"), "utf8"));
// Rows declared wont-port are deliberately not part of the live session.
const rows = catalog.rows.filter((r) => r.status !== "wont-port");

const fail = [];
const pass = [];
const log = (ok, id, detail) => {
  (ok ? pass : fail).push({ id, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? " — " + detail : ""}`);
};

async function j(url, opts) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data.error || res.statusText}`);
  return data;
}

const health = await j(`${BASE}/api/health`);
log(health.ok === true && health.kimiRuntime === false, "health.offline", JSON.stringify(health));

const shapes = await j(`${BASE}/api/catalog/shapes`);
log((shapes.shapes || []).length === 177, "shapes.177", `count=${(shapes.shapes || []).length}`);

const opened = await j(`${BASE}/api/open`, {
  method: "POST",
  body: JSON.stringify({}),
});
log(Boolean(opened.model), "model.open", opened.model?.title);
const allowed = new Set(opened.model?.allowedControlIds || []);

for (const row of rows) {
  const exempt = row.id.startsWith("chrome.createhub") || row.id === "chrome.neodeck.connect";
  const on = allowed.has(row.id) || exempt;
  if (!on) {
    log(row.status === "discovered", row.id, `status=${row.status} not in session`);
    continue;
  }
  // An allowlisted control must carry verified oracle evidence; specified or
  // implemented rows are not yet proof the live behavior matches the oracle.
  if (!exempt) {
    log(row.status === "verified", row.id, `status=${row.status}`);
  } else {
    log(true, row.id, "allowlisted (exempt surface)");
  }
}

const cmds = [
  ["pageRail", { open: true }],
  ["zoom", { percent: 80 }],
  ["zoom", { percent: 100 }],
  ["pageRail", { open: false }],
];
for (const [cmd, payload] of cmds) {
  try {
    const r = await j(`${BASE}/api/command`, {
      method: "POST",
      body: JSON.stringify({ cmd, ...payload }),
    });
    log(Boolean(r.model), `cmd.${cmd}`, "");
  } catch (e) {
    log(false, `cmd.${cmd}`, e.message);
  }
}

const formats = await j(`${BASE}/api/export/formats`);
// Google Slides export was removed from the product (offline product, no cloud
// account target); the format list must not offer it again.
log(
  !formats.formats?.some((f) => f.id === "google"),
  "export.google.removed",
);

const report = {
  base: BASE,
  at: new Date().toISOString(),
  pass: pass.length,
  fail: fail.length,
  failures: fail,
};
const out = path.join(ROOT, "docs/editor-oracle/runs/iframe-compare/VERIFY.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\n${pass.length} pass / ${fail.length} fail → ${out}`);
if (fail.length) process.exit(1);
