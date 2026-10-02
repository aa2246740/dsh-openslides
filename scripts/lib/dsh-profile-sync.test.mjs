import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { profilePackageMetadataStale } from "./dsh-profile-sync.mjs";

test("profile package metadata becomes stale when a workspace package manifest changes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-profile-root-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "slides-profile-home-"));
  const pkg = "dsh-slides-host";
  const workspaceDir = path.join(root, "packages", pkg);
  const profileDir = path.join(
    home,
    "profiles",
    "slides",
    "node_modules",
    "@open-slidestudio",
    pkg,
  );
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });
  const current = `${JSON.stringify({ name: `@open-slidestudio/${pkg}`, peerDependencies: { "@deepseek-ai/dsh-tools": "0.1.2-rc.1" } }, null, 2)}\n`;
  fs.writeFileSync(path.join(workspaceDir, "package.json"), current);
  fs.writeFileSync(path.join(profileDir, "package.json"), current);

  assert.equal(profilePackageMetadataStale(root, home, [pkg]), false);

  fs.writeFileSync(
    path.join(workspaceDir, "package.json"),
    `${JSON.stringify({ name: `@open-slidestudio/${pkg}`, peerDependencies: { "@deepseek-ai/dsh-tools": "0.1.2-rc.2" } }, null, 2)}\n`,
  );
  assert.equal(profilePackageMetadataStale(root, home, [pkg]), true);
});
