#!/usr/bin/env node
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.DSH_HOME || path.join(ROOT, ".dsh", "home");
const dsh = path.join(ROOT, "node_modules", ".bin", "dsh");
const brief = process.argv.includes("--brief")
  ? process.argv[process.argv.indexOf("--brief") + 1]
  : fs.readFileSync(path.join(ROOT, "fixtures/briefs/chengguang-cover.md"), "utf8").trim();

function spawnDsh() {
  return spawnSlidesDsh({
    dsh,
    cwd: ROOT,
    home: HOME,
    env: {
      SLIDESTUDIO_EDITOR_URL: EDITOR_ORIGIN,
      GEMINI_API_KEY: "",
      GOOGLE_API_KEY: "",
      SLIDESTUDIO_GEMINI_MODEL: "",
    },
  });
}

async function waitPhase(sessionId, kind, timeoutMs, childState) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    if (childState?.exited) {
      throw new Error(
        `DSH exited while waiting for ${kind} (code=${childState.code} signal=${childState.signal})`,
      );
    }
    const snap = await fetch(`${DSH_BASE}/slides/state/${sessionId}`).then((res) => res.json());
    last = snap;
    if (snap.phase?.kind === kind) return snap;
    if (snap.phase?.kind === "failed") {
      throw new Error(`slice failed: ${JSON.stringify(snap.phase)}`);
    }
    if (snap.phase?.kind === "paused") {
      const detail = String(snap.phase.detail ?? "");
      const waitResume =
        snap.rateLimitWait ||
        /provider-rate-limit|provider-token-plan|provider-quota|\b429\b|2056|Provider returned error/i.test(
          detail,
        );
      if (waitResume) {
        const remaining = snap.rateLimitWait?.nextRetryAt
          ? Math.max(1000, snap.rateLimitWait.nextRetryAt - Date.now())
          : 15_000;
        await wait(Math.min(remaining, 15_000));
        continue;
      }
      throw new Error(`slice paused: ${JSON.stringify(snap.phase)}`);
    }
    await wait(1000);
  }
  throw new Error(`timed out waiting for ${kind}: ${JSON.stringify(last)}`);
}

bindMinimaxCnKey(process.env);
assertMinimaxCnGenerateReady(process.env);

const nativeProc = await ensureNativeWebSidecar(ROOT);
let dshProc;
let dshExit;
try {
  dshProc = spawnDsh();
  dshExit = watchExit(dshProc);
  await waitHttpOk(`${DSH_BASE}/slides/health`, 60_000, "DSH", dshExit);
  const created = await fetch(`${DSH_BASE}/slides/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brief }),
  }).then((res) => res.json());
  if (!created.sessionId) throw new Error(`create failed: ${JSON.stringify(created)}`);
  const first = await waitPhase(created.sessionId, "page-ready", 600_000, dshExit);
  if (first.binding.design.kind !== "self-directed") {
    throw new Error("host injected a design preset");
  }
  if (first.project.pageCount < 1) throw new Error("no PPTD page");
  const coverSha = first.phase.cover.pageSha256;
  dshProc.kill("SIGKILL");
  await wait(1000);
  dshProc = spawnDsh();
  dshExit = watchExit(dshProc);
  await waitHttpOk(`${DSH_BASE}/slides/health`, 60_000, "DSH", dshExit);
  const resumed = await fetch(`${DSH_BASE}/slides/state/${created.sessionId}`).then((res) => res.json());
  if (resumed.binding.dshSessionId !== created.sessionId) {
    throw new Error("session id changed after reboot");
  }
  if (resumed.phase.kind === "page-ready" && resumed.phase.cover.pageSha256 !== coverSha) {
    throw new Error("cover sha changed on resume before edit");
  }
  await fetch(`${DSH_BASE}/slides/sessions/${created.sessionId}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "标题改成金色，保留同一页" }),
  }).then((res) => res.json());
  const after = await waitPhase(created.sessionId, "page-ready", 600_000, dshExit);
  if (after.project.pageCount > 1 && after.phase.cover.pageId !== first.phase.cover.pageId) {
    throw new Error("edit created a second page id");
  }
  const marker = {
    sessionId: created.sessionId,
    pageSha: after.phase.cover.pageSha256,
    pageCount: after.project.pageCount,
  };
  fs.mkdirSync(path.join(ROOT, "output"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "output", "dsh-slice-recovery.json"),
    `${JSON.stringify(marker, null, 2)}\n`,
  );
  console.log("recovery ok", marker);
} finally {
  dshProc?.kill("SIGTERM");
  nativeProc?.kill("SIGTERM");
}
