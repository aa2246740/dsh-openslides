#!/usr/bin/env node
/**
 * Real MiniMax generation against a named brief.
 * Usage: node scripts/test-real-generation.mjs --brief fixtures/briefs/chengguang-cover.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DSH_BASE,
  EDITOR_ORIGIN,
  ensureNativeWebSidecar,
  spawnSlidesDsh,
  wait,
  waitHttpOk,
  watchExit,
} from "./lib/dsh-runtime.mjs";
import {
  assertMinimaxCnGenerateReady,
  bindMinimaxCnKey,
} from "../packages/dsh-slides-host/dist/args.js";
import {
  isHardProviderFault,
  isWaitAndResumeFault,
  parseRetryAfterMs,
  rateLimitWaitMs,
  classifyAgentError,
} from "../packages/dsh-slides-host/dist/agent-fault.js";
import { exportEditablePptx } from "../packages/presentation-run/dist/export-deck.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.DSH_HOME || path.join(ROOT, ".dsh", "home");
const dsh = path.join(ROOT, "node_modules", ".bin", "dsh");

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

const briefPath = path.resolve(
  ROOT,
  argValue("--brief", "fixtures/briefs/chengguang-cover.md"),
);
const resumeSession = String(argValue("--session", "") ?? "").trim();
const wantPages = Number(argValue("--pages", "1"));
const timeoutMs = Number(
  argValue("--timeout-ms", String(wantPages > 4 ? 2_700_000 : 900_000)),
);
const keepAlive = hasFlag("--keep-alive");
const shouldExport = hasFlag("--export");
const requireCompose = hasFlag("--require-compose") || shouldExport;
const brief = fs.readFileSync(briefPath, "utf8");

async function existingSlidesHealth() {
  try {
    const res = await fetch(`${DSH_BASE}/slides/health`);
    if (!res.ok) return false;
    const body = await res.json();
    return body.product === "DSH SlideStudio";
  } catch {
    return false;
  }
}

const reused = await existingSlidesHealth();
if (!reused) {
  bindMinimaxCnKey(process.env);
  assertMinimaxCnGenerateReady(process.env);
}
const nativeProc = reused ? null : await ensureNativeWebSidecar(ROOT);
let dshProc;
let dshExit;
let continues = 0;
try {
  if (!reused) {
    dshProc = spawnSlidesDsh({
      dsh,
      cwd: ROOT,
      home: HOME,
      env: { GEMINI_API_KEY: "", GOOGLE_API_KEY: "", SLIDESTUDIO_GEMINI_MODEL: "" },
    });
    dshExit = watchExit(dshProc);
    await waitHttpOk(`${DSH_BASE}/slides/health`, 60_000, "DSH", dshExit);
  }
  const health = await fetch(`${DSH_BASE}/slides/health`).then((res) => res.json());
  if (health.product !== "DSH SlideStudio") {
    throw new Error(`slides health is not DSH SlideStudio: ${JSON.stringify(health)}`);
  }
  if (!health.minimaxReady) {
    throw new Error("the selected MiniMax generation route is not ready");
  }
  const created = resumeSession
    ? { sessionId: resumeSession }
    : await fetch(`${DSH_BASE}/slides/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief }),
      }).then((res) => res.json());
  if (!created.sessionId) throw new Error(`create failed: ${JSON.stringify(created)}`);
  const started = Date.now();
  let snap;
  let rateLimitWaits = 0;
  let lastHandsMtime = 0;
  const progressPath = path.join(ROOT, "output", "real-generation-progress.json");
  const writeProgress = (extra) => {
    fs.mkdirSync(path.join(ROOT, "output"), { recursive: true });
    fs.writeFileSync(
      progressPath,
      `${JSON.stringify(
        {
          sessionId: created.sessionId,
          pageCount: snap?.project?.pageCount ?? 0,
          phase: snap?.phase?.kind,
          pausedCode:
            snap?.phase?.kind === "paused"
              ? String(snap.phase.detail ?? "").split(":")[0]
              : undefined,
          model: snap?.binding?.provider?.modelId,
          provider: snap?.binding?.provider?.providerId,
          hostDirected: snap?.hostDirected === true,
          continues,
          rateLimitWaits,
          elapsedMs: Date.now() - started,
          ...extra,
        },
        null,
        2,
      )}\n`,
    );
  };
  while (Date.now() - started < timeoutMs) {
    if (dshExit?.exited) {
      throw new Error(`DSH exited code=${dshExit.code} signal=${dshExit.signal}`);
    }
    snap = await fetch(`${DSH_BASE}/slides/state/${created.sessionId}`).then((res) => res.json());
    writeProgress({});
    const handsFile = path.join(
      ROOT,
      snap.binding?.projectRoot ?? "",
      "_agent",
      "hands-log.jsonl",
    );
    let handsMtime = 0;
    try {
      handsMtime = fs.statSync(handsFile).mtimeMs;
    } catch {
      handsMtime = 0;
    }
    if (handsMtime > lastHandsMtime) {
      lastHandsMtime = handsMtime;
    }
    if (snap.phase?.kind === "failed") {
      const err = snap.phase.error ?? {};
      const failedDetail = String(err.detail ?? err.message ?? "");
      const failedFault = classifyAgentError({
        code: err.code,
        message: failedDetail,
      });
      if (isWaitAndResumeFault(failedFault)) {
        snap = {
          ...snap,
          phase: { kind: "paused", detail: `${failedFault.code}: ${failedDetail}` },
        };
      } else {
        throw new Error(`generation failed: ${JSON.stringify(snap.phase)}`);
      }
    }
    if (snap.phase?.kind === "paused") {
      if (snap.agentStatus === "busy") {
        writeProgress({ note: "paused marker while agent busy; not complete" });
        await wait(2000);
        continue;
      }
      const detail = String(snap.phase.detail ?? "");
      const pausedFault = classifyAgentError({ message: detail, code: detail.split(":")[0] });
      if (isHardProviderFault(pausedFault)) {
        writeProgress({ complete: false, note: `hard fault: ${detail.slice(0, 180)}` });
        throw new Error(`generation paused: ${detail}`);
      }
      if (
        isWaitAndResumeFault(pausedFault) ||
        /provider-rate-limit|provider-token-plan|provider-quota|\b429\b|rate[\s_-]?limit|2056|Provider returned error/i.test(
          detail,
        )
      ) {
        const retryAfterMs =
          snap.rateLimitWait?.nextRetryAt != null
            ? Math.max(0, snap.rateLimitWait.nextRetryAt - Date.now())
            : parseRetryAfterMs(detail);
        const waitMs = rateLimitWaitMs(rateLimitWaits, retryAfterMs);
        rateLimitWaits += 1;
        writeProgress({
          complete: false,
          note: `rate-limit wait ${waitMs}ms attempt ${rateLimitWaits}; same session ${created.sessionId}; not complete`,
        });
        await wait(waitMs);
        const after = await fetch(`${DSH_BASE}/slides/state/${created.sessionId}`).then((res) =>
          res.json(),
        );
        if (
          after.phase?.kind === "paused" &&
          after.agentStatus === "idle" &&
          !after.rateLimitWait
        ) {
          const pagesNow = after.project?.pageCount ?? 0;
          await fetch(`${DSH_BASE}/slides/sessions/${created.sessionId}/turn`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text:
                pagesNow >= wantPages
                  ? `Continue the same Hub session on the selected MiniMax provider after a provider wait. Never Gemini. Host did not paint leftover pages. Remaining gates only: render/review leftover pages, then review_pages, compose_deck, export_deck. ${pagesNow} pages exist.`
                  : `Continue the same Hub session on the selected MiniMax provider after a provider wait. Never Gemini. Host did not paint leftover pages. Do not rewrite finished pages. Write the next unwritten page now. ${pagesNow} pages exist.`,
            }),
          });
        }
        continue;
      }
      writeProgress({
        complete: false,
        note: `paused: ${detail.slice(0, 180)}`,
      });
      throw new Error(`generation paused: ${detail}`);
    }
    if (
      snap.binding?.design?.kind !== "self-directed" ||
      snap.hostDirected ||
      snap.inspection?.categoryId ||
      snap.inspection?.designSystemId
    ) {
      throw new Error("host directed the run");
    }
    const pages = snap.project?.pageCount ?? 0;
    const idle = snap.agentStatus === "idle";
    const composed = Boolean(snap.inspection?.composed) || snap.phase?.kind === "complete";
    if (idle && pages >= wantPages && !requireCompose && (snap.phase?.kind === "page-ready" || snap.phase?.kind === "complete")) {
      break;
    }
    if (idle && pages >= wantPages && requireCompose && composed) {
      break;
    }
    if (
      idle &&
      continues < Math.max(wantPages * 2, 4) &&
      (pages < wantPages || snap.phase?.kind === "generating" || (requireCompose && pages >= wantPages && !composed))
    ) {
      continues += 1;
      const next =
        pages < wantPages
          ? `Continue on the selected MiniMax provider. Never Gemini. Host did not pick a template and will not paint leftover pages. Do not rewrite finished pages. Write the next unwritten page now. ${pages}/${wantPages} pages exist. Then render_page and review_page.`
          : `STOP write_page. ${pages} pages exist on the selected MiniMax provider. Never Gemini. Host will not paint leftover pages. Remaining gates only: read_reference unread SKILL/pptd/slides_categories chunks; render_page then review_page for closing, org-cadence, risk, appendix-offline, appendix-online, august-decisions; then review_pages, compose_deck, export_deck.`;
      await fetch(`${DSH_BASE}/slides/sessions/${created.sessionId}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: next }),
      });
      continue;
    }
    await wait(2000);
  }
  if (!snap || (snap.project?.pageCount ?? 0) < wantPages) {
    throw new Error(`timed out: ${JSON.stringify(snap)}`);
  }
  const absProject = path.resolve(ROOT, snap.binding.projectRoot);
  let exported = null;
  if (shouldExport) {
    exported = await exportEditablePptx(absProject);
    if (!exported.ok) throw new Error(`editable export failed: ${exported.detail}`);
  }
  const marker = {
    brief: path.relative(ROOT, briefPath),
    sessionId: created.sessionId,
    pageCount: snap.project.pageCount,
    model: snap.binding.provider?.modelId,
    provider: snap.binding.provider?.providerId,
    hostDirected: false,
    design: snap.binding.design,
    whoDirected: "agent",
    projectRoot: snap.binding.projectRoot,
    editor: EDITOR_ORIGIN,
    receipts: snap.inspection?.receipts ?? [],
    visualReviewMissing: snap.inspection?.visualReviewMissing,
    continues,
    reused,
    exported,
  };
  fs.mkdirSync(path.join(ROOT, "output"), { recursive: true });
  const outName = `real-generation-${path.basename(briefPath, ".md")}.json`;
  fs.writeFileSync(path.join(ROOT, "output", outName), `${JSON.stringify(marker, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "output", "real-generation.json"), `${JSON.stringify(marker, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, ...marker }, null, 2));
} finally {
  if (!keepAlive && !reused) {
    dshProc?.kill("SIGTERM");
    nativeProc?.kill("SIGTERM");
  }
}
