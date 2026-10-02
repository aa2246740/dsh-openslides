#!/usr/bin/env node

import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { startEditorServer } from "../lib/editor-server.js";

const SKILL_NAME = "open-kimi-ppt";
const MIN_NODE_MAJOR = 18;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(packageRoot, "skills", SKILL_NAME);
const packageVersion = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version;

const KNOWN_TARGETS = [
  { id: "agents", label: "Shared / default", relative: [".agents", "skills"] },
  { id: "codex", label: "Codex", relative: [".codex", "skills"] },
  { id: "claude", label: "Claude Code", relative: [".claude", "skills"] },
  { id: "cursor", label: "Cursor", relative: [".cursor", "skills"] },
  { id: "workbuddy", label: "WorkBuddy", relative: [".workbuddy", "skills"] },
];

function assertNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (!Number.isInteger(major) || major < MIN_NODE_MAJOR) {
    throw new Error(
      `Node.js ${MIN_NODE_MAJOR}+ is required; found ${process.version}. Install from https://nodejs.org`,
    );
  }
}

function printHelp(command) {
  if (command === "serve") {
    console.log(`Start the local PPTD editor and exporter.

Usage:
  open-kimi-ppt-skill serve [options]

Options:
  --port <number>  HTTP port (default: 55173)
  --open           Open the editor in the default browser
  -h, --help       Show this help
  -V, --version    Show version
`);
    return;
  }

  console.log(`Install ${SKILL_NAME} for your AI coding agent or start its local editor.

Usage:
  open-kimi-ppt-skill [install] [options]
  open-kimi-ppt-skill serve [options]

Install options:
  --target <directory>  Skills directory (repeatable)
  -y, --yes             Non-interactive; install to ~/.agents/skills when no --target
  --all                 Install to all detected agent skill directories
                        (agents whose home directory is missing are skipped)
  -h, --help            Show this help
  -V, --version         Show version

In an interactive terminal (no --target / --yes / --all), a checklist is shown:
  ↑/↓ move  space select  a all  enter confirm

For agents / CI, prefer:
  npx open-kimi-ppt-skill@latest install -y

Re-running install replaces an existing open-kimi-ppt installation.
Run "open-kimi-ppt-skill serve --help" for server options.
`);
}

function printVersion() {
  console.log(packageVersion);
}

function parseArguments(arguments_) {
  const args = [...arguments_];
  const command = args[0] === "install" || args[0] === "serve" ? args.shift() : "install";
  const options = command === "serve"
    ? { command, open: false, port: 55173 }
    : { command, targets: [], yes: false, all: false };

  while (args.length > 0) {
    const argument = args.shift();

    // Accepted for backward compatibility; install always overwrites.
    if (command === "install" && argument === "--force") {
      continue;
    }

    if (command === "install" && (argument === "-y" || argument === "--yes")) {
      options.yes = true;
      continue;
    }

    if (command === "install" && argument === "--all") {
      options.all = true;
      continue;
    }

    if (command === "install" && argument === "--target") {
      const target = args.shift();
      if (!target || target.startsWith("-")) {
        throw new Error("--target requires a directory");
      }
      options.targets.push(resolve(target));
      continue;
    }

    if (command === "serve" && argument === "--port") {
      const port = Number(args.shift());
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error("--port must be an integer between 1 and 65535");
      }
      options.port = port;
      continue;
    }

    if (command === "serve" && argument === "--open") {
      options.open = true;
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--version" || argument === "-V") {
      options.version = true;
      continue;
    }

    throw new Error(`unknown argument: ${argument}`);
  }

  return options;
}

function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", (error) => console.warn(`Could not open the browser: ${error.message}`));
  child.unref();
}

function defaultSkillsDirectory() {
  return join(homedir(), ".agents", "skills");
}

function knownTargetDirectories() {
  const home = homedir();
  return KNOWN_TARGETS.map((entry) => ({
    ...entry,
    directory: join(home, ...entry.relative),
  }));
}

function displayPath(absolutePath) {
  const home = homedir();
  const normalized = absolutePath.split(sep).join("/");
  const homeNormalized = home.split(sep).join("/");
  if (normalized === homeNormalized || normalized.startsWith(`${homeNormalized}/`)) {
    return `~${normalized.slice(homeNormalized.length)}`;
  }
  return absolutePath;
}

function isInteractiveInstall() {
  return Boolean(input.isTTY && output.isTTY);
}

function uniqueDirectories(directories) {
  const seen = new Set();
  const unique = [];
  for (const directory of directories) {
    const key = resolve(directory);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }
  return unique;
}

async function promptInstallTargets() {
  const choices = knownTargetDirectories();
  const selected = new Set([0]);
  let cursor = 0;
  const lines = choices.length + 3;

  const render = (initial = false) => {
    if (!initial) {
      output.write(`\u001b[${lines}A`);
    }
    output.write("Install open-kimi-ppt to which skills directories?\n");
    output.write("↑/↓ move · space select · a all · enter confirm · ctrl+c cancel\n");
    for (const [index, choice] of choices.entries()) {
      const pointer = index === cursor ? "❯" : " ";
      const mark = selected.has(index) ? "◉" : "◯";
      const installed = existsSync(join(choice.directory, SKILL_NAME, "SKILL.md"))
        ? " (installed)"
        : "";
      const line = `${pointer}${mark} ${displayPath(choice.directory).padEnd(28)} ${choice.label}${installed}`;
      output.write(`\u001b[2K${line}\n`);
    }
  };

  return new Promise((resolvePromise, reject) => {
    if (typeof input.setRawMode !== "function") {
      resolvePromise([defaultSkillsDirectory()]);
      return;
    }

    render(true);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");

    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
    };

    const onData = (key) => {
      if (key === "\u0003") {
        cleanup();
        output.write("\n");
        reject(new Error("install cancelled"));
        return;
      }

      if (key === "\u001b[A" || key === "k") {
        cursor = (cursor - 1 + choices.length) % choices.length;
        render();
        return;
      }

      if (key === "\u001b[B" || key === "j") {
        cursor = (cursor + 1) % choices.length;
        render();
        return;
      }

      if (key === " ") {
        if (selected.has(cursor)) selected.delete(cursor);
        else selected.add(cursor);
        render();
        return;
      }

      if (key === "a" || key === "A") {
        if (selected.size === choices.length) selected.clear();
        else for (let index = 0; index < choices.length; index += 1) selected.add(index);
        render();
        return;
      }

      if (key === "\r" || key === "\n") {
        if (selected.size === 0) {
          output.write("\u0007");
          return;
        }
        cleanup();
        output.write("\n");
        resolvePromise([...selected].sort((a, b) => a - b).map((index) => choices[index].directory));
      }
    };

    input.on("data", onData);
  });
}

function detectedTargetDirectories() {
  const home = homedir();
  const detected = [];
  const skipped = [];
  for (const entry of knownTargetDirectories()) {
    if (existsSync(join(home, entry.relative[0]))) detected.push(entry);
    else skipped.push(entry);
  }
  return { detected, skipped };
}

async function resolveInstallTargets(options) {
  if (options.targets.length > 0) {
    return uniqueDirectories(options.targets);
  }

  if (options.all) {
    const { detected, skipped } = detectedTargetDirectories();
    for (const entry of skipped) {
      console.log(`Skipped ${entry.directory} (${entry.label} not found)`);
    }
    if (detected.length === 0) {
      console.warn(
        "No known agent directories found; nothing installed. Use -y for ~/.agents/skills or --target <directory>.",
      );
    }
    return uniqueDirectories(detected.map((entry) => entry.directory));
  }

  if (options.yes || !isInteractiveInstall()) {
    return [defaultSkillsDirectory()];
  }

  return promptInstallTargets();
}

function installSkillTo(skillsDirectory) {
  if (!existsSync(join(sourceDirectory, "SKILL.md"))) {
    throw new Error(`packaged skill is incomplete: ${sourceDirectory}`);
  }

  const destination = join(skillsDirectory, SKILL_NAME);
  const replaced = existsSync(destination);

  mkdirSync(skillsDirectory, { recursive: true });
  const stagingRoot = mkdtempSync(join(skillsDirectory, `.${SKILL_NAME}-`));
  const stagedSkill = join(stagingRoot, SKILL_NAME);

  try {
    cpSync(sourceDirectory, stagedSkill, {
      recursive: true,
      filter: (source) => ![".DS_Store", "_user_meta.json"].includes(basename(source)),
    });

    rmSync(destination, { recursive: true, force: true });
    renameSync(stagedSkill, destination);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  console.log(
    replaced
      ? `Updated ${SKILL_NAME} at ${destination}`
      : `Installed ${SKILL_NAME} to ${destination}`,
  );
}

async function installSkill(options) {
  const targets = await resolveInstallTargets(options);
  for (const target of targets) {
    installSkillTo(target);
  }
}

async function main() {
  assertNodeVersion();
  const options = parseArguments(process.argv.slice(2));
  if (options.version) {
    printVersion();
    return;
  }
  if (options.help) {
    printHelp(options.command);
    return;
  }

  if (options.command === "install") {
    await installSkill(options);
    return;
  }

  const { server, url } = await startEditorServer({ port: options.port });
  console.log(`Open Kimi PPT editor is running at ${url}`);
  console.log("Press Ctrl+C to stop the server.");
  if (options.open) openBrowser(url);

  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
