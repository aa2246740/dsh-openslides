/** Build the self-contained desktop tgz: the whole SlideStudio runtime inside
 * one installable package, mirroring dsh-personal-entry's release flow. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(pluginDir, "..");
const output = join(pluginDir, ".local", "release");
const manifest = JSON.parse(readFileSync(join(pluginDir, "package.json"), "utf8"));
if (manifest.name !== "dsh-personal-slides") {
  throw new Error("expected the dsh-personal-slides package");
}

const version = manifest.version ?? "0.1.0";
const RUNTIME_PACKAGES = [
  "pptd-v2",
  "canvas-session",
  "exporter-native",
  "project-store",
  "presentation-run",
  "dsh-slides-host",
];
const BUNDLED_NODE_MODULES = [
  "yaml",
  "zod",
  "fonteditor-core",
  "@xmldom/xmldom",
  "jszip",
  "lie",
  "pako",
  "readable-stream",
  "setimmediate",
  "https",
  "image-size",
  "pptxgenjs",
  ...RUNTIME_PACKAGES.map((p) => `@open-slidestudio/${p}`),
  "playwright",
  "playwright-core",
];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const stage = mkdtempSync(join(output, "stage-"));
const pkg = join(stage, "package");
mkdirSync(pkg, { recursive: true });

const copy = (rel, { filter } = {}) => {
  const from = join(repoRoot, rel);
  if (!existsSync(from)) throw new Error(`missing runtime input: ${rel}`);
  cpSync(from, join(pkg, rel), { recursive: true, filter });
};

copy("apps/native-web/src", {
  filter: (src) => !src.endsWith(".test.mjs"),
});
copy("apps/native-web/public");
for (const name of RUNTIME_PACKAGES) {
  copy(`packages/${name}/package.json`);
  copy(`packages/${name}/dist`);
}
copy("packages/agent-harness/reference/openkimi-source-manifest.v1.json");
copy("packages/agent-harness/reference/openkimi-visual-manifest.v1.json");
copy("vendor/open-kimi-ppt/skill-1.2.0");
copy("vendor/open-kimi-ppt/git-pre-wipe");
copy(".runtime/playwright");
copy("fixtures/okp-yu7-ppt");
for (const rel of ["lib", "src", "README.md", "dshx.yml", "cordis.yml"]) {
  const from = join(pluginDir, rel);
  if (existsSync(from)) cpSync(from, join(pkg, rel), { recursive: true });
}

writeFileSync(
  join(pkg, "cordis.patch.yml"),
  "- insert:\n    - id: dsh-personal-slides\n      name: dsh-personal-slides\n",
);

// Real node_modules entries (no symlinks) so resolution works inside the
// installed package regardless of the host install's layout.
for (const name of BUNDLED_NODE_MODULES) {
  if (name === "playwright" || name === "playwright-core") continue; // shipped under .runtime
  const scope = name.startsWith("@") ? name.split("/")[0] : null;
  const leaf = scope ? name.split("/")[1] : name;
  const destDir = join(pkg, "node_modules", scope ?? "");
  mkdirSync(destDir, { recursive: true });
  const src = name.startsWith("@open-slidestudio/")
    ? join(repoRoot, "packages", leaf)
    : join(repoRoot, "node_modules", name);
  if (!existsSync(src)) throw new Error(`missing node_modules input: ${name}`);
  cpSync(src, join(destDir, leaf), {
    recursive: true,
    filter: (s) =>
      name.startsWith("@open-slidestudio/")
        ? !(s.includes("/src/") || s.endsWith(".tsbuildinfo") || s.includes("/node_modules/"))
        : !(s.includes("/test/") || s.endsWith(".map")),
  });
}

const published = {
  ...manifest,
  private: true,
  files: [
    "lib",
    "src",
    "apps",
    "packages",
    "vendor",
    ".runtime",
    "fixtures",
    "cordis.patch.yml",
    "cordis.yml",
    "dshx.yml",
    "README.md",
  ],
  bundleDependencies: BUNDLED_NODE_MODULES,
  dsh: {
    ...(manifest.dsh ?? {}),
    bundle: { patch: "./cordis.patch.yml" },
  },
};
delete published.scripts;
delete published.devDependencies;
await writeFileSync(join(pkg, "package.json"), JSON.stringify(published, null, 2) + "\n");

mkdirSync(output, { recursive: true });
const packed = JSON.parse(
  execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", output], {
    cwd: pkg,
    encoding: "utf8",
  }),
)[0];
const bytes = readFileSync(join(output, packed.filename));
writeFileSync(
  join(output, "SHA256SUMS"),
  `${createHash("sha256").update(bytes).digest("hex")}  ${packed.filename}\n`,
);
rmSync(stage, { recursive: true, force: true });
console.log(JSON.stringify({ file: join(output, packed.filename), version }, null, 2));
