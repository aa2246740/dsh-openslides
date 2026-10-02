import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { resolvePlaywrightRuntimeFile } from "./playwright-runtime-path.mjs";

export function bindPlaywrightRuntimeEnv(repoRoot, env = process.env) {
  const resolved = resolvePlaywrightRuntimeFile(env, {
    repoRoot,
    homeDir: os.homedir(),
  });
  if (resolved.ready) {
    env.SLIDESTUDIO_PLAYWRIGHT_RUNTIME = resolved.path;
    env.OPEN_SLIDESTUDIO_ROOT = env.OPEN_SLIDESTUDIO_ROOT?.trim() || repoRoot;
  }
  return resolved;
}

export function ensurePlaywrightRuntime(repoRoot, env = process.env) {
  const first = bindPlaywrightRuntimeEnv(repoRoot, env);
  if (first.ready) return first;
  const setup = path.join(repoRoot, "scripts", "setup-browser-runtime.mjs");
  const result = spawnSync(process.execPath, [setup, "--install"], {
    cwd: repoRoot,
    env: { ...env, OPEN_SLIDESTUDIO_ROOT: repoRoot },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `Pinned Playwright setup failed (exit ${result.status}). render_page cannot raster. Run: npm run setup:browser`,
    );
  }
  const after = bindPlaywrightRuntimeEnv(repoRoot, env);
  if (!after.ready) {
    throw new Error(
      `Pinned Playwright runtime is missing after setup:browser: ${after.path}. Hub must not advertise render:true.`,
    );
  }
  return after;
}
