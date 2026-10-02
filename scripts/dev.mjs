#!/usr/bin/env node
/** Start API (8787) + Vite web (5173) together.
 * LEGACY stack only — this is the archived `apps/web` + `apps/server` path
 * (see LEGACY.md). The product path is the native DSH kernel + editor
 * sidecar: `npm start` (scripts/dsh-slides.mjs) serves the Hub on :13080
 * and the editor on :55200. */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(name, cmd, args) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => {
    console.log(`[${name}] exited ${code}`);
    process.exit(code ?? 1);
  });
  return child;
}

console.log("DSH SlideStudio dev (LEGACY stack — product path is `npm start`, Hub on :13080)");
console.log("  API  http://127.0.0.1:8787");
console.log("  Web  http://127.0.0.1:5173");

const api = run("api", "npm", ["run", "start", "-w", "@open-slidestudio/server"]);
const web = run("web", "npm", ["run", "dev", "-w", "@open-slidestudio/web"]);

function shutdown() {
  api.kill("SIGTERM");
  web.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
