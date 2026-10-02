#!/usr/bin/env node
// Boot an isolated RC2 Web Host with dsh-personal-slides + the isolation probe
// and assert the slides plane wires per-agent without leaking.
//
//   node scripts/rc2-isolation/run.mjs [--keep] [--timeout <sec>]
//
// Env:
//   DSH_RC2_HOST          dir containing node_modules/@deepseek-ai/dsh@rc.2
//                         (default /tmp/rc2-host; create with `npm i @deepseek-ai/dsh@0.2.0-rc.2`)
//   OPEN_SLIDESTUDIO_ROOT repo checkout (default: this repo root)
//   DSH_RC2_DSH_BIN       override `npx dsh`
//
// A fresh timestamped DSH_HOME is created per run; the OS picks the web port
// (--port 0) and the editor sidecar port, so a live stack is never disturbed.
// Exit 1 on any failed assertion; the boot log is kept under output/rc2-isolation/.

import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(process.env.OPEN_SLIDESTUDIO_ROOT ?? join(here, "../../../../.."));
const rc2Host = resolve(process.env.DSH_RC2_HOST ?? "/tmp/rc2-host");
const keep = process.argv.includes("--keep");
const timeoutSec = Number(process.argv[process.argv.indexOf("--timeout") + 1] ?? 90);

const pluginEntry = join(repoRoot, "dsh-personal-slides/lib/types/dsh-personal-slides.js");
const registryPkg = join(rc2Host, "node_modules/@deepseek-ai/dsh-agent-preset-registry/lib/index.js");
if (!existsSync(pluginEntry)) {
  console.error(`plugin entry missing: ${pluginEntry}\nbuild first: (cd dsh-personal-slides && DSHX_HARNESS=<harness> npm run build)`);
  process.exit(2);
}
if (!existsSync(registryPkg)) {
  console.error(`RC2 Host node_modules missing: ${registryPkg}\nset DSH_RC2_HOST to a dir with \`npm i @deepseek-ai/dsh@0.2.0-rc.2\``);
  process.exit(2);
}

const freePort = () => new Promise((res, rej) => {
  const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }).on("error", rej);
});

const work = mkdtempSync(join(tmpdir(), "rc2-isolation-"));
const dshHome = join(work, "dsh-home");
mkdirSync(dshHome, { recursive: true });
const probeCwd = join(work, "agent-cwd");
mkdirSync(probeCwd, { recursive: true });
const outDir = join(repoRoot, "output/rc2-isolation");
mkdirSync(outDir, { recursive: true });
const logPath = join(outDir, `run-${Date.now().toString(36)}.log`);
const editorPort = await freePort();

writeFileSync(join(work, "probe.patch.yml"), [
  "- insert:",
  "    - id: dsh-personal-slides",
  `      name: '${pluginEntry}'`,
  "    - id: dps-probe",
  `      name: '${join(here, "probe.js")}'`,
  "- id: agent-preset-registry",
  "  config:",
  "    default: slides",
  "",
].join("\n"));

const log = createWriteStream(logPath);
const child = spawn("npx", ["dsh", "web", "--patch", join(work, "probe.patch.yml"), "--no-open", "--port", "0"], {
  cwd: rc2Host,
  env: {
    ...process.env,
    DSH_HOME: dshHome,
    OPEN_SLIDESTUDIO_ROOT: repoRoot,
    DSH_RC2_HOST: rc2Host,
    PROBE_CWD: probeCwd,
    SLIDES_EDITOR_PORT: String(editorPort),
  },
});
child.stdout.pipe(log);
child.stderr.pipe(log);

let buf = "";
child.stdout.on("data", (d) => { buf += d.toString(); });
child.stderr.on("data", (d) => { buf += d.toString(); });

const deadline = Date.now() + timeoutSec * 1000;
while (!buf.includes("[probe] done") && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 500));
  if (buf.includes("[probe] fatal")) break;
}
if (!keep) child.kill("SIGTERM");
else {
  const url = buf.match(/dsh web: (http:\/\/\S+)/)?.[1];
  console.log(`[rc2-isolation] keep-alive Host at ${url} (DSH_HOME=${dshHome}, editor=${editorPort})`);
}

const checks = [
  ["roster registers slides preset unbroken", /\[probe\] presets:.*"id":"slides"(?![^\]]*"broken":true)/s],
  ["slides agent owns its tool set", /\[probe\] slides-agent tools=\[(?=[^\]]*open_project)(?=[^\]]*export_deck)(?=[^\]]*ask_user_question)/],
  ["slides agent open_project reaches product code (no UNKNOWN_TOOL)", /\[probe\] slides-agent open_project: (?![^\n]*UNKNOWN_TOOL)/],
  ["slides agent bash is denied by its own preset", /\[probe\] slides-agent bash:[^\n]*forbids bash/],
  ["normal agent keeps standard tools", /\[probe\] normal-agent tools=\[[^\]]*bash[^\]]*ask_user_question/],
  ["normal agent sees no open_project", /\[probe\] normal-agent tools=\[(?![^\]]*open_project)/],
  ["normal agent open_project is UNKNOWN_TOOL", /\[probe\] normal-agent open_project:[^\n]*UNKNOWN_TOOL/],
  ["normal agent bash reaches its tool (arg error, not preset denial)", /\[probe\] normal-agent bash:[^\n]*INVALID_ARGS/],
  ["no slides-host wiring warnings", /^(?!.*\[slides-host\]).*$/s],
  ["probe finished", /\[probe\] done/],
];

let fail = 0;
for (const [label, re] of checks) {
  const ok = re.test(buf);
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) fail++;
}
console.log(`[rc2-isolation] log: ${logPath}`);
if (buf.includes("[probe] fatal")) console.log(buf.split("\n").filter((l) => l.includes("[probe] fatal")).join("\n"));
process.exit(fail === 0 ? 0 : 1);
