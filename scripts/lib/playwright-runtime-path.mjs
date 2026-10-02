import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PINNED_PLAYWRIGHT_VERSION = "1.61.1";
export const PINNED_CHROMIUM_REVISION = "1228";

export function repoPlaywrightRuntimeFile(repoRoot) {
  return path.join(repoRoot, ".runtime", "playwright", "runtime.mjs");
}

export function homePlaywrightRuntimeFile(homeDir = os.homedir()) {
  return path.join(homeDir, ".codex", "playwright-runtime", "runtime.mjs");
}

export function runtimeFileLooksPinned(runtimeFile) {
  try {
    if (!fs.existsSync(runtimeFile)) return false;
    const st = fs.statSync(runtimeFile);
    if (!st.isFile() || st.size < 32) return false;
    const head = fs.readFileSync(runtimeFile, "utf8").slice(0, 8000);
    return head.includes("launchPinnedChromium") && head.includes("verifyPinnedRuntime");
  } catch {
    return false;
  }
}

/** Same lookup as packages/presentation-run page-raster.ts. Keep them aligned. */
export function resolvePlaywrightRuntimeFile(
  env = process.env,
  roots = { repoRoot: env.OPEN_SLIDESTUDIO_ROOT?.trim() || process.cwd(), homeDir: os.homedir() },
) {
  const configured = env.SLIDESTUDIO_PLAYWRIGHT_RUNTIME?.trim();
  if (configured) {
    return { path: configured, ready: runtimeFileLooksPinned(configured) };
  }
  const local = repoPlaywrightRuntimeFile(roots.repoRoot);
  if (runtimeFileLooksPinned(local)) return { path: local, ready: true };
  const home = homePlaywrightRuntimeFile(roots.homeDir);
  if (runtimeFileLooksPinned(home)) return { path: home, ready: true };
  return { path: local, ready: false };
}
