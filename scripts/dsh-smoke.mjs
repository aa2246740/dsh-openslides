#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DSH_BASE,
  spawnSlidesDsh,
  waitHttpOk,
  watchExit,
} from "./lib/dsh-runtime.mjs";
import { ensureSlidesProfileCurrent } from "./lib/dsh-profile-sync.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.DSH_HOME || path.join(ROOT, ".dsh", "home");
const dsh = path.join(ROOT, "node_modules", ".bin", "dsh");

function parseBoot(html) {
  const start = html.indexOf('globalThis["__DSH_BOOT__"] = ');
  if (start < 0) throw new Error("boot page is missing __DSH_BOOT__");
  const jsonStart = html.indexOf("{", start);
  let depth = 0;
  let end = jsonStart;
  for (let i = jsonStart; i < html.length; i += 1) {
    if (html[i] === "{") depth += 1;
    else if (html[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return JSON.parse(html.slice(jsonStart, end));
}

ensureSlidesProfileCurrent(ROOT, HOME);
let webUrl;
const child = spawnSlidesDsh({
  dsh,
  cwd: ROOT,
  home: HOME,
  onStdoutLine: (line) => {
    const match = line.match(/dsh web: (http:\/\/\S+)/);
    if (match) webUrl = match[1];
  },
});
const exitState = watchExit(child);

try {
  const healthRes = await waitHttpOk(`${DSH_BASE}/slides/health`, 60_000, "DSH", exitState);
  const health = await healthRes.json();
  if (health.product !== "DSH SlideStudio") {
    throw new Error(`unexpected health product: ${JSON.stringify(health)}`);
  }
  if (health.generateReady !== true || health.produceGates?.ok !== true) {
    throw new Error(`produce gates not loaded: ${JSON.stringify(health.produceGates)}`);
  }
  if (health.produceGates?.emptyWriteRejected !== true) {
    throw new Error("loaded host did not reject empty leftover write_page");
  }
  // 0.1.7 gates the web root behind the printed token: GET /?token=… issues a
  // dsh-auth-* cookie (303) and only then serves the app shell.
  if (!webUrl) throw new Error("dsh did not print a web URL");
  const authRes = await fetch(webUrl, { redirect: "manual" });
  const cookies = authRes.headers.getSetCookie().map((row) => row.split(";")[0]);
  if (cookies.length === 0) throw new Error("dsh token URL did not set an auth cookie");
  const html = await fetch(`${DSH_BASE}/`, {
    headers: { cookie: cookies.join("; ") },
  }).then((res) => res.text());
  const ids = parseBoot(html).entries.map((row) => row.id);
  if (ids.some((id) => id.includes("dsh-client-ui-layout"))) {
    throw new Error("official ui-layout is still in the boot roster");
  }
  if (!ids.some((id) => id.includes("dsh-slides-client"))) {
    throw new Error(`slides-client missing from boot roster: ${ids.join(", ")}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (exitState.exited) {
    throw new Error(`dsh exited after health (code=${exitState.code} signal=${exitState.signal})`);
  }
  console.log("dsh smoke ok", health, { bootEntries: ids.length });
} finally {
  child.kill("SIGTERM");
}
