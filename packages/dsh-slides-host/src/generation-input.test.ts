import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { loadProject } from "@open-slidestudio/pptd-v2";
import { SliceSessionStore } from "./slice-session.js";
import {
  assertAttachmentBudget, generationFormat, inputSha256, persistGenerationInput, verifiedAttachment,
  type GenerationInputSnapshot,
} from "./generation-input.js";

function temporary(t: TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oss-generation-input-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("both supported creation formats reach the real PPTD manifest without seed slides", (t) => {
  const root = temporary(t);
  const store = new SliceSessionStore(root);
  for (const layout of ["16:9", "4:3"] as const) {
    const format = generationFormat("Slides", layout);
    const opened = store.openProject({
      dshSessionId: crypto.randomUUID(), title: "format boundary", design: { kind: "self-directed" },
      provider: { providerId: "not-executed", modelId: "not-executed" }, size: format.size,
    });
    const project = loadProject(store.resolveRoot(opened.binding));
    assert.deepEqual(project.presentation.size, layout === "4:3" ? [720, 540] : [960, 540]);
    assert.deepEqual(project.presentation.pages, []);
    assert.deepEqual(project.pages, []);
  }
});

test("unsupported format requests are not snapped to a supported default", () => {
  for (const [kind, layout] of [["Docs", "16:9"], ["Report", "4:3"], ["Slides", "Adaptive"], ["Slides", null]]) {
    assert.throws(() => generationFormat(kind, layout));
  }
});

test("creation input is immutable even when the current provider later changes", (t) => {
  const root = temporary(t);
  const store = new SliceSessionStore(root);
  const sessionId = crypto.randomUUID();
  const format = generationFormat(undefined, "4:3");
  const opened = store.openProject({
    dshSessionId: sessionId, title: "immutable input", design: { kind: "self-directed" },
    provider: { providerId: "initial", modelId: "initial" }, size: format.size,
  });
  const projectRoot = store.resolveRoot(opened.binding);
  const initialMessage = "User creation intent";
  const input: GenerationInputSnapshot = {
    version: 1, sessionId, acceptedAt: new Date().toISOString(), brief: initialMessage, format,
    design: { kind: "self-directed" }, model: { provider: "initial", model: "initial" },
    attachments: [], initialMessage, initialMessageSha256: inputSha256(initialMessage),
  };
  persistGenerationInput(projectRoot, input);
  const file = path.join(projectRoot, "_agent", "generation-input.v1.json");
  const before = fs.readFileSync(file);
  assert.throws(() => persistGenerationInput(projectRoot, input), { code: "EEXIST" });
  store.updateProvider(sessionId, { providerId: "later", modelId: "later" });
  assert.throws(() => persistGenerationInput(projectRoot, { ...input, brief: "replacement" }));
  assert.deepEqual(fs.readFileSync(file), before);
});

test("an unclaimed directory cannot be adopted as a newly created task", (t) => {
  const root = temporary(t);
  const store = new SliceSessionStore(root);
  const input = {
    title: "collision", design: { kind: "self-directed" as const }, provider: { providerId: "none", modelId: "none" },
  };
  const first = store.openProject({ ...input, dshSessionId: "samehead-first" });
  const before = fs.readFileSync(path.join(store.resolveRoot(first.binding), "deck.pptd"));
  assert.throws(() => store.openProject({ ...input, dshSessionId: "samehead-second" }));
  assert.deepEqual(fs.readFileSync(path.join(store.resolveRoot(first.binding), "deck.pptd")), before);
  assert.equal(store.bindingFor("samehead-first")?.dshSessionId, "samehead-first");
});

test("incomplete, clipped and altered attachment receipts are rejected", () => {
  const text = "boundary reference";
  const receipt = {
    id: "selected", name: "reference.txt", text, chars: text.length, bytes: Buffer.byteLength(text),
    parsed: true, complete: true, parser: "utf8-full-v1", storeId: inputSha256("test store"),
    originalSha256: inputSha256(text), textSha256: inputSha256(text),
  };
  for (const patch of [
    { id: "other" }, { parsed: false }, { complete: false }, { clipped: true }, { truncated: true },
    { text: `${text} changed` }, { textSha256: "invalid" }, { storeId: "unowned" }, { ownerId: "other" },
  ]) assert.throws(() => verifiedAttachment("selected", { ...receipt, ...patch }));
  const largeText = "x".repeat(30_000);
  const large = verifiedAttachment("selected", {
    ...receipt, text: largeText, bytes: largeText.length, chars: largeText.length,
    originalSha256: inputSha256(largeText), textSha256: inputSha256(largeText),
  });
  assert.throws(() => assertAttachmentBudget([large, { ...large, id: "second" }]), /no text was clipped/);
});
