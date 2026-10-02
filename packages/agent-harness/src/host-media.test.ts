import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evidencePagesFromReference, maybePlaceImage, parseMarkdownTables } from "./host-media.js";

describe("host media", () => {
  it("returns no image when no ports are configured", async () => {
    const src = await maybePlaceImage("东京 浅草", {});
    assert.equal(src, undefined);
  });

  it("turns a markdown table into an evidence page", () => {
    const md = `
| 区域 | 营收 | 同店 |
| --- | --- | --- |
| 华东 | 4,887 | +7.2% |
| 华北 | 2,315 | -2.1% |
`;
    const tables = parseMarkdownTables(md);
    assert.equal(tables.length, 1);
    assert.equal(tables[0]!.rows.length, 2);
    const pages = evidencePagesFromReference(md);
    assert.equal(pages.length, 1);
    assert.equal(pages[0]!.exhibit, "table");
    assert.match(pages[0]!.lines.join(" "), /4,887/);
  });
});
