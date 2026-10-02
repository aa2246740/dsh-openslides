import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { exportProjectToPptx } from "./export-pptd.js";
import {
  createEmptyProject,
  listComposedPage,
  saveProject,
} from "@open-slidestudio/pptd-v2";

/**
 * Minimal XML well-formedness check — enough to catch the failure modes this
 * package can actually produce: unbalanced tags, unquoted/broken attributes,
 * raw `&`/`<` in text, and truncated documents. It is not a validating parser.
 */
function assertWellFormedXml(xml: string, part: string): void {
  const stack: string[] = [];
  let i = 0;
  const fail = (msg: string): never => {
    throw new Error(`${part}@${i}: ${msg}`);
  };
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      if (/&(?!(amp|lt|gt|quot|apos|#)[0-9a-zA-Z]*;)/.test(xml.slice(i))) {
        fail("raw & in text");
      }
      break;
    }
    const text = xml.slice(i, lt);
    if (text.includes("]]>") ) fail("stray ]]> in text");
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text)) {
      fail("raw & in text");
    }
    i = lt;
    if (xml.startsWith("<!--", i)) {
      const end = xml.indexOf("-->", i + 4);
      if (end === -1) fail("unterminated comment");
      i = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", i)) {
      const end = xml.indexOf("]]>", i + 9);
      if (end === -1) fail("unterminated CDATA");
      i = end + 3;
      continue;
    }
    if (xml.startsWith("<?", i)) {
      const end = xml.indexOf("?>", i + 2);
      if (end === -1) fail("unterminated PI");
      i = end + 2;
      continue;
    }
    if (xml.startsWith("<!", i)) {
      // DOCTYPE etc — skip to closing >
      const end = xml.indexOf(">", i + 2);
      if (end === -1) fail("unterminated declaration");
      i = end + 1;
      continue;
    }
    const closing = xml.startsWith("</", i);
    const nameMatch = /^<\/?([A-Za-z_][\w.:-]*)/.exec(xml.slice(i, i + 128));
    if (!nameMatch) return fail("malformed tag");
    const name = nameMatch[1]!;
    // Find the tag close, respecting quoted attributes.
    let j = i + nameMatch[0].length;
    let selfClose = false;
    for (;;) {
      const gt = xml.indexOf(">", j);
      if (gt === -1) fail("unterminated tag");
      const inner = xml.slice(j, gt);
      const quoteCount = (inner.match(/"/g) ?? []).length;
      if (quoteCount % 2 === 0) {
        if (/'/.test(inner)) {
          const single = (inner.match(/'/g) ?? []).length;
          if (single % 2 !== 0) {
            j = gt + 1;
            continue;
          }
        }
        selfClose = /\/\s*$/.test(inner);
        j = gt + 1;
        break;
      }
      j = gt + 1;
    }
    const attrText = xml.slice(i + nameMatch[0].length, j);
    if (!closing) {
      // Attribute scan consumes name="v"|'v' pairs — quoted values may hold
      // spaces, so naive whitespace splitting would false-positive.
      const attrs = attrText.replace(/\/?\s*>$/, "");
      let rest = attrs;
      const attrRe = /^\s*([A-Za-z_][\w.:-]*)(\s*=\s*("[^"<&]*"|'[^'<&]*'))?/;
      while (rest.trim()) {
        const am = attrRe.exec(rest);
        if (!am) return fail(`malformed attribute in <${name}>`);
        rest = rest.slice(am[0].length);
      }
      // Self-closing elements never enter the stack; fall through to i = j.
      if (!selfClose) stack.push(name);
    } else {
      const top = stack.pop();
      if (top !== name) fail(`mismatched </${name}> (open: ${top ?? "none"})`);
    }
    i = j;
  }
  if (stack.length) fail(`unclosed elements: ${stack.join(",")}`);
}

function buildFixtureProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pptd-export-xml-"));
  const project = createEmptyProject(dir, { title: 'XML <check> & "quotes"' });
  listComposedPage(project, "pages/p1.page", {
    background: { type: "solid", color: "#FFFFFF" },
    elements: [
      {
        elementId: "t1",
        elementType: "text",
        bounds: [40, 40, 600, 80],
        content: {
          text: 'Fish & Chips <fast> "quoted"',
          fontSize: 28,
          color: "#111111",
          fontFamily: { latin: 'A & B "Odd"', ea: "宋体" },
        },
      },
      {
        elementId: "s1",
        elementType: "shape",
        shapeName: "roundRect",
        bounds: [40, 160, 300, 120],
        fill: { type: "solid", color: "#0057FF" },
        border: { color: "#111111", width: 2, style: "dash" },
      },
      {
        elementId: "tb1",
        elementType: "table",
        bounds: [40, 320, 600, 240],
        columnWidths: [2, 1, 1],
        rowHeights: [1, 1],
        rows: [
          [
            { text: "a", colSpan: 2, bold: true },
            { text: "" },
            { text: "b" },
          ],
          [
            { text: "c & <d>" },
            { text: "e", fill: { type: "solid", color: "#EEEEEE" } },
            { text: "f", rowSpan: 1 },
          ],
        ],
      },
    ],
  });
  saveProject(project);
  return dir;
}

describe("exported pptx xml well-formedness", () => {
  it("every xml/rels part in the package is well-formed", async () => {
    const dir = buildFixtureProject();
    const { data, report } = await exportProjectToPptx(dir);
    assert.equal(report.ok, true, JSON.stringify(report.degradations));
    const zip = await JSZip.loadAsync(data);
    const xmlParts = Object.keys(zip.files).filter(
      (n) => n.endsWith(".xml") || n.endsWith(".rels"),
    );
    assert.ok(xmlParts.length > 5, "expected several xml parts");
    for (const part of xmlParts) {
      const xml = await zip.files[part]!.async("string");
      assertWellFormedXml(xml, part);
    }
  });

  it("docProps timestamps are pinned for reproducible output", async () => {
    const dir = buildFixtureProject();
    const a = await exportProjectToPptx(dir);
    const b = await exportProjectToPptx(dir);
    const zip = await JSZip.loadAsync(a.data);
    const core = await zip.files["docProps/core.xml"]!.async("string");
    assert.match(core, /<dcterms:created[^>]*>2000-01-01T00:00:00Z</);
    assert.deepEqual(a.data, b.data);
  });
});
