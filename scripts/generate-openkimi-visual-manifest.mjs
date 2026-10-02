import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOpenKimiVisualManifest,
  resolveOpenKimiVisualManifestPath,
  resolveOpenKimiVisualRoot,
} from "../packages/agent-harness/dist/openkimi-visual-pack.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolveOpenKimiVisualRoot(repoRoot);
const manifestPath = resolveOpenKimiVisualManifestPath(repoRoot);
const manifest = createOpenKimiVisualManifest(sourceRoot);

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifest.files.length} previews -> ${manifestPath}\n`);
