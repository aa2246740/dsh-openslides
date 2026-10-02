#!/usr/bin/env node
// Drive Open SlideStudio features with the repo-pinned Chromium and write evidence.
//
//   node .agents/skills/verify-openslides/scripts/drive.mjs --list
//   node .agents/skills/verify-openslides/scripts/drive.mjs open-deck page-rail
//   node .agents/skills/verify-openslides/scripts/drive.mjs all
//
// One editor server per run on a free port (never 55200), one scratch deck per
// feature under output/verify-<run>/, evidence under output/qa-verify-openslides/<run>/.
// Exit code 1 when any check failed or a browser error was recorded.
import fs from "node:fs";
import path from "node:path";
import { recorder, startRun, REPO } from "./lib.mjs";

import * as editorCore from "./drivers/editor-core.mjs";
import * as editing from "./drivers/editing.mjs";
import * as review from "./drivers/review.mjs";
import * as assistant from "./drivers/assistant.mjs";
import * as hub from "./drivers/hub.mjs";

const all = [...hub.features, ...editorCore.features, ...editing.features, ...review.features, ...assistant.features];
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flag = (n) => process.argv.includes(`--${n}`);

if (flag("list")) {
  for (const f of all) console.log(`${f.id.padEnd(22)} ${f.title}`);
  process.exit(0);
}

const wanted = args.length === 0 || args.includes("all") ? all : args.map((id) => {
  const f = all.find((x) => x.id === id);
  if (!f) {
    console.error(`unknown feature: ${id}\nknown: ${all.map((x) => x.id).join(", ")}`);
    process.exit(2);
  }
  return f;
});

const ctx = await startRun();
console.log(`run ${ctx.runId}\n  editor  ${ctx.base}\n  fake kernel :${ctx.fake.port}\n  evidence ${path.relative(REPO, ctx.evidenceDir)}\n`);

const results = [];
let aborted = null;
try {
  for (const feature of wanted) {
    const rec = recorder(ctx, feature.id);
    const started = Date.now();
    try {
      await feature.run(ctx, rec);
    } catch (e) {
      rec.check("driver ran to completion", false, e?.stack ?? e);
      // Keep what the user would have seen at the moment of failure.
      for (const [i, p] of rec.pages.entries()) {
        await p.screenshot({ path: path.join(rec.dir, `failure-${i}.png`) }).catch(() => {});
      }
    }
    rec.json("commands", rec.commands);
    const errors = rec.errors.filter((e) => !(feature.ignoreErrors ?? []).some((re) => re.test(e)));
    const failed = rec.checks.filter((c) => !c.ok);
    results.push({ id: feature.id, title: feature.title, ms: Date.now() - started, checks: rec.checks, gaps: rec.gaps, notes: rec.notes, errors, failed: failed.length });
    console.log(`${failed.length || errors.length ? "FAIL" : "ok  "} ${feature.id.padEnd(22)} ${rec.checks.length - failed.length}/${rec.checks.length} checks${errors.length ? `, ${errors.length} browser error(s)` : ""}`);
    for (const c of failed) console.log(`       x ${c.name}${c.detail ? `  -> ${c.detail.split("\n")[0]}` : ""}`);
    if (failed.length) console.log(`       commands seen: ${rec.commands.slice(-10).join(",") || "(none)"}`);
    for (const e of errors.slice(0, 3)) console.log(`       ! ${e.slice(0, 200)}`);
    for (const g of rec.gaps) console.log(`       ${g.ok ? "resolved" : "PRODUCT GAP"}: ${g.name}${g.detail ? `  -> ${g.detail}` : ""}`);
    // Doctor after every drive: a wedged server would poison the next feature.
    const d = await ctx.doctor();
    if (!d.ok) {
      aborted = `editor unhealthy after ${feature.id}: ${JSON.stringify(d)}`;
      console.log(`ABORT ${aborted}`);
      break;
    }
    await ctx.pages?.get?.(feature.id)?.close?.();
  }
} finally {
  fs.writeFileSync(path.join(ctx.evidenceDir, "report.json"), JSON.stringify({ runId: ctx.runId, aborted, results }, null, 2));
  const md = ["# verify-openslides run " + ctx.runId, "", aborted ? `**ABORTED**: ${aborted}\n` : "", "| feature | checks | browser errors |", "|---|---|---|"];
  for (const r of results) md.push(`| ${r.id} | ${r.checks.length - r.failed}/${r.checks.length} | ${r.errors.length} |`);
  for (const r of results) {
    if (!r.failed && !r.errors.length && !r.notes.length && !r.gaps.length) continue;
    md.push("", `## ${r.id}`);
    for (const c of r.checks.filter((c) => !c.ok)) md.push(`- FAIL ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    for (const g of r.gaps) md.push(`- ${g.ok ? "gap resolved" : "PRODUCT GAP"}: ${g.name}${g.detail ? ` — ${g.detail}` : ""}`);
    for (const e of r.errors) md.push(`- browser: ${e}`);
    for (const n of r.notes) md.push(`- note: ${n}`);
  }
  fs.writeFileSync(path.join(ctx.evidenceDir, "report.md"), md.join("\n") + "\n");
  await ctx.stop();
}
const bad = results.filter((r) => r.failed || r.errors.length).length;
console.log(`\n${results.length - bad}/${results.length} features clean. evidence kept at ${path.relative(REPO, ctx.evidenceDir)}`);
process.exit(bad || aborted ? 1 : 0);
