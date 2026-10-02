import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNumericPageText } from "./write-page-text.js";

const page = () => ({ id: "page", expectedPageSha256: "abc", elements: [
  {elementId: "pagenum", elementType: "text", content: {text: 2}, bounds: [0, 0, 10, 20]},
  {elementId: "table", elementType: "table", rows: [[{text: 0}, {text: 12.5}]]},
  {elementId: "chart", elementType: "chart", data: [2], content: {text: 2}},
] });
const baseline = { pageSha256: "abc", elements: [
  {elementId: "pagenum", elementType: "text", content: {text: "02"}},
  {elementId: "table", elementType: "table", rows: [[{text: "00"}, {text: "12.50"}]]},
] };
test("numeric display text preserves the exact current read_page representation", () => {
  const args = page(); normalizeNumericPageText(args, baseline);
  assert.equal(args.elements[0]!.content!.text, "02");
  assert.deepEqual(args.elements[1]!.rows, [[{text: "00"}, {text: "12.50"}]]);
  assert.deepEqual(args.elements[0]!.bounds, [0, 0, 10, 20]);
  assert.deepEqual(args.elements[2]!.data, [2]);
  assert.equal(args.elements[2]!.content!.text, 2);
});
test("a stale hash cannot restore old text formatting, explicit strings stay authoritative", () => {
  const args = page(); normalizeNumericPageText(args, {...baseline, pageSha256: "stale"});
  assert.equal(args.elements[0]!.content!.text, "2");
  const explicit = {elements: [{elementId: "pagenum", elementType: "text", content: {text: "2"}}], expectedPageSha256: "abc"};
  normalizeNumericPageText(explicit, baseline);
  assert.equal(explicit.elements[0]!.content.text, "2");
});
test("invalid objects, null and booleans still go to schema rejection", () => {
  for (const value of [null, true, {text: "02"}, ["02"]]) {
    const args = {elements: [{elementType: "text", content: {text: value}}]};
    normalizeNumericPageText(args);
    assert.deepEqual(args.elements[0]!.content.text, value);
  }
});
