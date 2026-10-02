import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = process.env.OPEN_SLIDESTUDIO_ROOT || process.cwd();
const dshBasePkg = path.join(
  root,
  "node_modules",
  "@deepseek-ai",
  "dsh",
  "node_modules",
  "@deepseek-ai",
  "dsh-base",
  "package.json",
);
const require = createRequire(dshBasePkg);
const resolved = require.resolve("@deepseek-ai/dsh-llm-pi-ai");
const outDir = path.join(root, "output", "remediation-2026-09-14", "checks");
fs.mkdirSync(outDir, { recursive: true });
const payload = {
  pid: process.pid,
  ppid: process.ppid,
  cwd: process.cwd(),
  resolved: fs.realpathSync(resolved),
  vendor: fs.realpathSync(path.join(root, "vendor", "dsh-llm-pi-ai", "lib", "index.js")),
  argv0: process.argv[1] ?? "",
};
fs.writeFileSync(path.join(outDir, "live-process-resolve.json"), `${JSON.stringify(payload, null, 2)}\n`);
