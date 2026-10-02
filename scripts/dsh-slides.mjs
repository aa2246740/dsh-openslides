#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureNativeWebSidecar, spawnSlidesDsh } from "./lib/dsh-runtime.mjs";
import { ensureSlidesProfileCurrent } from "./lib/dsh-profile-sync.mjs";
import { ensurePlaywrightRuntime } from "./lib/ensure-playwright-runtime.mjs";
import { ensureDshPiAiReplayFix } from "./lib/ensure-dsh-pi-ai-replay-fix.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.DSH_HOME || path.join(ROOT, ".dsh", "home");
const dsh = path.join(ROOT, "node_modules", ".bin", "dsh");

ensurePlaywrightRuntime(ROOT);
const dshPiAiPin = ensureDshPiAiReplayFix(ROOT);
console.error(`dsh-llm-pi-ai pin ${dshPiAiPin.resolved}`);
ensureSlidesProfileCurrent(ROOT, HOME);

const { assertIsolatedDshHome, importLocalDshModels, syncMimoDesktopProvider } = await import(
  "../packages/dsh-slides-host/dist/local-models.js"
);
assertIsolatedDshHome(HOME);
importLocalDshModels({
  sourceHome: path.join(os.homedir(), ".dsh"),
  destHome: HOME,
  env: process.env,
});
// MiMo Desktop binds a NEW loopback engine port every app session. Align the
// isolated home with the live engine before the kernel boots; best-effort.
try {
  const mimo = await syncMimoDesktopProvider(HOME);
  console.error(`mimo-desktop engine ${mimo ? `resolved → ${mimo.baseURL}` : "not running; keeping previous route"}`);
} catch (error) {
  console.error(`mimo-desktop sync skipped: ${error?.message ?? error}`);
}

const sidecar = await ensureNativeWebSidecar(ROOT);
const resolveProbe = pathToFileURL(path.join(ROOT, "scripts/lib/log-dsh-pi-ai-resolve.mjs")).href;
const nodeOptions = [process.env.NODE_OPTIONS, `--import ${resolveProbe}`].filter(Boolean).join(" ");
const child = spawnSlidesDsh({
  dsh,
  cwd: ROOT,
  home: HOME,
  env: { NODE_OPTIONS: nodeOptions },
});

function forward(signal) {
  child.kill(signal);
  // The sidecar is our child too when we spawned it — do not orphan it.
  if (sidecar) sidecar.kill(signal);
}

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("exit", (code, signal) => {
  if (sidecar) sidecar.kill("SIGTERM");
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
