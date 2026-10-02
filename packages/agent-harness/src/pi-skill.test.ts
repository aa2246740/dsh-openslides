import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  HOST_SKILL_NAME,
  formatSkillPathsMarkdown,
  resolveHostSkillDir,
  resolvePiSkillDirs,
} from "./pi-skill.js";

describe("pi host skill", () => {
  it("ships a loadable SKILL.md without official export", () => {
    const dir = resolveHostSkillDir();
    const text = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
    assert.equal(path.basename(dir), HOST_SKILL_NAME);
    assert.match(text, /^---\nname: open-slidestudio/m);
    assert.match(text, /description:/);
    assert.match(text, /write_page/);
    assert.match(text, /write_todo/);
    assert.match(text, /compose_deck/);
    assert.match(text, /After adopt, every color MUST/);
    assert.match(text, /#06223F/);
    assert.match(text, /#FDC356/);
    assert.match(text, /omitted fill is no paint/);
    assert.match(text, /assertion-sentence conclusions/);
    assert.match(text, /chapter breadcrumb/);
    assert.match(text, /Host will not paint YAML or rebind `Theme\.colors`/);
    assert.doesNotMatch(text, /python3[\s\S]{0,80}export_pptx\.py/);
    assert.doesNotMatch(text, /https?:\/\/\S*kimi\.com/);
    assert.doesNotMatch(text, /statics\.moonshot/);
  });

  it("points at the vendored open-kimi-ppt skill", () => {
    const dirs = resolvePiSkillDirs();
    assert.ok(fs.existsSync(path.join(dirs.vendor, "SKILL.md")));
    const md = formatSkillPathsMarkdown(dirs);
    assert.match(md, /open-slidestudio/);
    assert.match(md, /open-kimi-ppt/);
    assert.match(md, /Do not run official export/);
  });
});
