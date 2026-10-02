#!/usr/bin/env node
/**
 * Read-only deterministic audit for an existing PPTD project.
 * It does not start Pi, call a provider, render pages, or mutate the project.
 */
import fs from "node:fs";
import path from "node:path";
import { loadProject } from "../packages/pptd-v2/dist/index.js";
import {
  inspectRunLedger,
  reportFactIssues,
  resolveTodoExhibits,
  reviewSkillPages,
} from "../packages/agent-harness/dist/index.js";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const projectArg = option("--project");
const projectRoot = projectArg ? path.resolve(projectArg) : "";
if (!projectRoot || !fs.existsSync(projectRoot)) {
  console.error(
    "usage: node scripts/native-check-existing.mjs --project <dir> [--brief-file <file>] [--out <json>]",
  );
  process.exit(2);
}

const readJson = (file, fallback) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
const runtime = readJson(path.join(projectRoot, "_agent", "runtime.json"), {});
const outline = readJson(path.join(projectRoot, "_agent", "outline.json"), { items: [] });
const briefFile = option("--brief-file");
const brief = briefFile
  ? fs.readFileSync(path.resolve(briefFile), "utf8")
  : String(
      runtime.brief ||
        fs.readFileSync(path.join(projectRoot, "_agent", "brief.txt"), "utf8"),
    );
const project = loadProject(projectRoot);
const pages = project.pages.map((entry, index) => ({
  id: path.basename(entry.path, ".page") || `page-${index + 1}`,
  pageType: entry.page.pageType,
  notes: entry.page.notes,
  background: entry.page.background,
  elements: entry.page.elements,
}));
const rawTodos = Array.isArray(outline.items) ? outline.items : [];
const todos = pages.map((_, index) => {
  const raw = rawTodos[index] && typeof rawTodos[index] === "object" ? rawTodos[index] : {};
  const todo = {
    title: String(raw.title ?? `Page ${index + 1}`),
    note: String(raw.note ?? ""),
    exhibits: Array.isArray(raw.exhibits) ? raw.exhibits : [],
  };
  return { ...todo, exhibits: resolveTodoExhibits(todo, index, brief) };
});
const structural = reviewSkillPages(pages, {
  projectRoot,
  todos,
  mode: "compose",
});
const facts = reportFactIssues(brief, pages);
const ledger = inspectRunLedger(projectRoot);
const report = {
  schemaVersion: 1,
  projectRoot,
  pageCount: pages.length,
  todoCount: todos.length,
  ok: structural.ok && facts.length === 0 && ledger.composeReady && ledger.composed,
  structural: {
    ok: structural.ok,
    issues: structural.issues,
  },
  facts,
  ledger: {
    composeReady: ledger.composeReady,
    composed: ledger.composed,
    blockers: ledger.composeBlockers,
  },
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const out = option("--out");
if (out) fs.writeFileSync(path.resolve(out), serialized, "utf8");
process.stdout.write(serialized);
if (!report.ok) process.exitCode = 1;
