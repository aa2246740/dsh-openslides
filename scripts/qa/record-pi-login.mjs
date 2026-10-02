#!/usr/bin/env node
/**
 * Hub Pi login panel: API key writes auth.json. Does not print secrets.
 * Uses a throwaway auth file so ~/.pi/agent/auth.json is not touched.
 */
import { launchPinnedChromium } from "../lib/pinned-playwright.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./gestures.mjs";
import { loadRootEnv } from "./load-env.mjs";

loadRootEnv();

const OUT = process.env.QA_PI_LOGIN_OUT || path.join(ROOT, "output", "qa-pi-login");
const ART = process.env.QA_PI_LOGIN_ART || "/opt/cursor/artifacts/qa-pi-login";
const AUTH = path.join(OUT, "auth.json");
const BASE = process.env.BASE || "http://127.0.0.1:55231";
const SERVER_JS = path.join(ROOT, "apps/native-web/src/server.mjs");

fs.mkdirSync(OUT, { recursive: true });

const notes = {
  startedAt: new Date().toISOString(),
  errors: [],
  healthChip: null,
  afterLogin: null,
  afterLogout: null,
};

function shot(page, name) {
  return page.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => name);
}

async function startDedicatedServer() {
  const occupied = await fetch(`${BASE}/api/health`)
    .then((response) => response.ok)
    .catch(() => false);
  if (occupied) {
    throw new Error(
      `refusing to reuse ${BASE}: Pi login QA requires a fresh server bound to the throwaway auth file`,
    );
  }
  const port = new URL(BASE).port || "80";
  const log = path.join(OUT, `server-${port}.log`);
  const logFd = fs.openSync(log, "a");
  const child = spawn(process.execPath, [SERVER_JS], {
    cwd: ROOT,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      PORT: port,
      SLIDESTUDIO_PI_AUTH_PATH: AUTH,
      SLIDESTUDIO_PI_ALLOW_ENV: "0",
    },
  });
  fs.closeSync(logFd);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`dedicated Pi login server exited ${child.exitCode}`);
    const healthy = await fetch(`${BASE}/api/health`)
      .then((response) => response.ok)
      .catch(() => false);
    if (healthy) return child;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  child.kill("SIGTERM");
  throw new Error(`dedicated Pi login server did not become healthy at ${BASE}`);
}

const server = await startDedicatedServer();
const stopServer = () => {
  if (server.exitCode == null && !server.killed) server.kill("SIGTERM");
};
process.once("exit", stopServer);
const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
notes.healthChip = {
  piAvailable: health.piAvailable,
  piAuth: health.piAuth,
};

const browser = await launchPinnedChromium({
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,900"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);

try {
  await page.goto(`${BASE}/hub.html`, { waitUntil: "networkidle" });
  await page.click("#btn-model");
  await page.waitForSelector("#pi-panel:not([hidden])");
  await shot(page, "01-pi-login-panel");

  await page.selectOption("#pi-provider", "google");
  await page.locator('#pi-method-tabs button[data-method="api_key"]').click();
  await page.fill("#pi-key", "qa-google-key-not-a-secret");
  await page.click("#btn-pi-login");
  await page.waitForFunction(
    () => /已登录 · API Key/.test(document.getElementById("pi-login-status")?.textContent || ""),
    null,
    { timeout: 8000 },
  );
  await page.waitForFunction(
    () => [...document.querySelectorAll("#capability-list li")].some((li) => li.textContent === "已登录 · API Key"),
    null,
    { timeout: 8000 },
  );
  await shot(page, "02-api-key-saved");
  notes.afterLogin = await fetch(`${BASE}/api/pi/auth`).then((r) => r.json());
  if (notes.afterLogin.auth?.source !== "auth.json") {
    notes.errors.push(`expected auth.json login, got ${JSON.stringify(notes.afterLogin.auth)}`);
  }
  const raw = JSON.parse(fs.readFileSync(AUTH, "utf8"));
  if (raw.google?.key !== "qa-google-key-not-a-secret") {
    notes.errors.push("auth.json did not store the API key");
  }
  if (JSON.stringify(notes.afterLogin).includes("qa-google-key-not-a-secret")) {
    notes.errors.push("API leaked the key in /api/pi/auth");
  }

  await page.click("#btn-pi-logout");
  await page.waitForFunction(
    () => /未登录/.test(document.getElementById("pi-login-status")?.textContent || ""),
    null,
    { timeout: 8000 },
  );
  await shot(page, "03-logged-out");
  notes.afterLogout = await fetch(`${BASE}/api/pi/auth`).then((r) => r.json());
  if (notes.afterLogout.auth?.ready) {
    notes.errors.push(`after logout auth.ready must be false, got ${JSON.stringify(notes.afterLogout.auth)}`);
  }

  await page.selectOption("#pi-provider", "anthropic");
  await page.locator('#pi-method-tabs button[data-method="oauth"]').click();
  await shot(page, "04-oauth-ready");
} catch (err) {
  notes.errors.push(err instanceof Error ? err.message : String(err));
  await shot(page, "99-crash").catch(() => {});
} finally {
  notes.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
  await browser.close();
  stopServer();
  process.removeListener("exit", stopServer);
  try {
    fs.mkdirSync(ART, { recursive: true });
    for (const name of fs.readdirSync(OUT)) {
      if (name === "auth.json") continue;
      fs.copyFileSync(path.join(OUT, name), path.join(ART, name));
    }
  } catch {
    /* ignore */
  }
  console.log(JSON.stringify({
    errors: notes.errors,
    afterLogin: notes.afterLogin?.auth || null,
    afterLogout: notes.afterLogout?.auth || null,
    out: OUT,
  }, null, 2));
  if (notes.errors.length) process.exitCode = 1;
}
