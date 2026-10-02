#!/usr/bin/env node
/** Catch in-box word/number wrapping that canvas-overflow checks miss. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const pdf = path.resolve(process.argv[2] || "");
if (!pdf || !fs.existsSync(pdf)) {
  throw new Error("usage: verify-pptx-text-layout.mjs <rendered.pdf>");
}
if (fs.readFileSync(pdf).subarray(0, 5).toString("ascii") !== "%PDF-") {
  throw new Error(`expected a rendered PDF, got: ${pdf}`);
}

const pdftotext = process.env.PDFTOTEXT_BIN || "pdftotext";
const text = execFileSync(pdftotext, ["-layout", pdf, "-"], { encoding: "utf8" });
const pages = text.split("\f").filter((page) => page.trim());
const failures = [];

if (pages.length !== 4) failures.push(`expected 4 pages, got ${pages.length}`);
const flow = pages[1] || "";
const actions = pages[3] || "";
if (/\bwrite_pag\b/.test(flow)) failures.push("page 2 split write_page inside one label");
for (const number of ["01", "02", "03"]) {
  if (!new RegExp(`^\\s*${number}\\s+`, "m").test(actions)) {
    failures.push(`page 4 split action number ${number}`);
  }
}

console.log(JSON.stringify({ ok: failures.length === 0, pageCount: pages.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
