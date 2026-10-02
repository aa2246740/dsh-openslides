import { pathToFileURL } from "node:url";
import { resolvePlaywrightRuntimeFile } from "./playwright-runtime-path.mjs";

const resolved = resolvePlaywrightRuntimeFile();
if (!resolved.ready) {
  throw new Error(
    `Pinned Playwright runtime is unavailable at ${resolved.path}. Run npm run setup:browser.`,
  );
}

const runtime = await import(pathToFileURL(resolved.path).href);

export const launchPinnedChromium = runtime.launchPinnedChromium;
export const loadPinnedPlaywright = runtime.loadPinnedPlaywright;
export const verifyPinnedRuntime = runtime.verifyPinnedRuntime;
export const pinnedRuntime = runtime.pinnedRuntime;
