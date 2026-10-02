#!/usr/bin/env node
/**
 * Validate docs/editor-oracle row.json files against schema (Phase A gate).
 * Offline; no network.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oracleRoot = path.join(root, "docs", "editor-oracle");
const schemaPath = path.join(oracleRoot, "schema", "interaction-row.schema.json");
const catalogPath = path.join(oracleRoot, "catalog", "index.yaml");

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name === "row.json") acc.push(p);
  }
  return acc;
}

function fail(msg) {
  console.error(`[editor-oracle] FAIL: ${msg}`);
  process.exitCode = 1;
}

if (!fs.existsSync(schemaPath)) {
  fail(`missing schema: ${schemaPath}`);
  process.exit(1);
}

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const required = schema.required ?? [];
const rows = walk(path.join(oracleRoot, "rows"));

let ok = 0;
for (const file of rows) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail(`${file}: invalid JSON (${e.message})`);
    continue;
  }
  for (const key of required) {
    if (!(key in data)) fail(`${file}: missing required field "${key}"`);
  }
  if (data.id && typeof data.id === "string" && !/^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/.test(data.id)) {
    fail(`${file}: id pattern invalid: ${data.id}`);
  }
  if (data.status && data.status === "specified") {
    const dir = path.dirname(file);
    const before = path.join(dir, "shots", "before.png");
    const after = path.join(dir, "shots", "after.png");
    // EXAMPLE rows under _examples may be discovered without shots
    if (!file.includes(`${path.sep}_examples${path.sep}`)) {
      if (!fs.existsSync(before) || !fs.existsSync(after)) {
        fail(`${file}: status=specified requires shots/before.png and after.png`);
      }
    }
  }
  ok++;
}

console.log(`[editor-oracle] checked ${rows.length} row.json file(s), schema present`);

const byId = new Map();
const realRows = rows.filter((file) => !file.includes(`${path.sep}_examples${path.sep}`));
for (const file of realRows) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (data.id) byId.set(data.id, { file, status: data.status, blockedReason: data.blockedReason });
  } catch {
    // already reported
  }
}

if (!fs.existsSync(catalogPath)) {
  fail(`missing catalog: ${catalogPath}`);
} else {
  let catalogRows = [];
  try {
    const catalog = YAML.parse(fs.readFileSync(catalogPath, "utf8"));
    catalogRows = Array.isArray(catalog?.rows) ? catalog.rows : [];
  } catch (error) {
    fail(`${catalogPath}: invalid YAML (${error.message})`);
  }
  const catalogById = new Map();
  for (const entry of catalogRows) {
    if (!entry?.id || !entry?.path) {
      fail(`${catalogPath}: every row needs id and path`);
      continue;
    }
    if (catalogById.has(entry.id)) {
      fail(`${catalogPath}: duplicate id ${entry.id}`);
      continue;
    }
    catalogById.set(entry.id, entry);
    const rowFile = path.join(oracleRoot, entry.path, "row.json");
    if (!fs.existsSync(rowFile)) {
      fail(`${catalogPath}: ${entry.id} points to missing ${rowFile}`);
      continue;
    }
    const row = JSON.parse(fs.readFileSync(rowFile, "utf8"));
    for (const [field, actual] of [
      ["id", row.id],
      ["status", row.status],
      ["surface", row.surface],
      ["testId", row.test?.id],
    ]) {
      if (entry[field] !== actual) {
        fail(`${catalogPath}: ${entry.id} ${field}=${entry[field]} but row.json has ${actual}`);
      }
    }
  }
  for (const [id, row] of byId) {
    if (!catalogById.has(id)) {
      fail(`${row.file}: real oracle row ${id} is missing from catalog/index.yaml`);
    }
  }
  console.log(`[editor-oracle] catalog checked ${catalogRows.length} row(s)`);
}

const serverSrc = fs.readFileSync(
  path.join(root, "apps/native-web/src/server.mjs"),
  "utf8",
);
const allowMatch = serverSrc.match(/const ORACLE_CONTROLS = \[([\s\S]*?)\];/);
if (!allowMatch) {
  fail("native-web server missing ORACLE_CONTROLS");
} else {
  const ids = [...allowMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      fail(`enabled control ${id} has no oracle row`);
      continue;
    }
    if (!["specified", "implemented", "verified", "wont-port"].includes(row.status)) {
      fail(`enabled control ${id} is status=${row.status} (must be specified|implemented|verified|wont-port)`);
    }
    if (row.status === "wont-port") {
      fail(`enabled control ${id} is wont-port; do not put it in ORACLE_CONTROLS`);
    }
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("[editor-oracle] OK");
