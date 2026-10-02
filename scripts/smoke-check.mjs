#!/usr/bin/env node
/**
 * Offline smoke check for Open SlideStudio packages.
 *
 * Requires packages to be built (`npm run build` or at least the library workspaces).
 * Does NOT hit the network. Uses MockProvider for agent flow.
 *
 * Usage (from repo root):
 *   node scripts/smoke-check.mjs
 *   npm run smoke
 *
 * Dev UI (separate):
 *   npm run dev
 *   → http://localhost:5173  (CreateHub → generate with mock-offline model)
 */

import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
let failed = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, err) {
  failed += 1;
  console.error(`  ✗ ${label}`);
  console.error(`    ${err instanceof Error ? err.message : String(err)}`);
}

async function importPkg(name, relDist) {
  const distEntry = path.join(root, relDist);
  try {
    return await import(pathToFileURL(distEntry).href);
  } catch (err) {
    // Fallback: workspace package resolution (needs dist built)
    try {
      return await import(name);
    } catch {
      throw err;
    }
  }
}

console.log("Open SlideStudio smoke check (offline)\n");

// ── @open-slidestudio/pptd ──────────────────────────────────────────
console.log("pptd");
try {
  const pptd = await importPkg(
    "@open-slidestudio/pptd",
    "packages/pptd/dist/index.js",
  );
  const {
    createEmptyDeck,
    createSampleResearchDeck,
    applyCommand,
    undoCommand,
    cmdAddElement,
    parseDeck,
    validateDeckInvariants,
    sortSlidesByOrder,
  } = pptd;

  const empty = createEmptyDeck({ title: "Smoke Empty" });
  if (empty.slides.length !== 1) throw new Error("empty deck should have 1 slide");
  ok("createEmptyDeck");

  const sample = createSampleResearchDeck("Smoke Research");
  if (sample.slides.length < 5) throw new Error("sample deck too short");
  parseDeck(sample);
  const inv = validateDeckInvariants(sample);
  if (inv.length) throw new Error(`invariants: ${inv.join("; ")}`);
  if (/kimi/i.test(JSON.stringify(sample))) {
    throw new Error("sample deck must not contain KIMI branding");
  }
  ok(`createSampleResearchDeck (${sample.slides.length} slides, schema ok)`);

  const slideId = empty.slides[0].id;
  const el = {
    kind: "text",
    id: "smoke_t1",
    x: 40,
    y: 40,
    width: 400,
    height: 80,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    paragraphs: [{ runs: [{ text: "Hello", fontSize: 24 }] }],
  };
  const added = applyCommand(empty, cmdAddElement(slideId, el));
  if (added.deck.slides[0].elements.length !== 1) {
    throw new Error("apply did not add element");
  }
  // ApplyResult is { deck, command } — undo uses the enriched command from apply
  const undoneDeck = undoCommand(added.deck, added.command);
  if (undoneDeck.slides[0].elements.length !== 0) {
    throw new Error("undo did not remove element");
  }
  ok("applyCommand + undoCommand");

  sortSlidesByOrder(sample);
  ok("sortSlidesByOrder");
} catch (err) {
  fail("pptd", err);
  console.error("    Hint: npm run build -w @open-slidestudio/pptd");
}

// ── @open-slidestudio/design-brain ──────────────────────────────────
console.log("\ndesign-brain");
try {
  const db = await importPkg(
    "@open-slidestudio/design-brain",
    "packages/design-brain/dist/index.js",
  );
  const {
    defaultConsultingTheme,
    defaultConsultingContract,
    assembleDesignSystemPrompt,
    contractToThemeTokens,
    extractThemeFromHints,
  } = db;

  const theme = defaultConsultingTheme();
  if (!theme.colors?.primary || !theme.fonts?.heading) {
    throw new Error("theme missing primary/heading");
  }
  ok(`defaultConsultingTheme (${theme.name})`);

  const contract = defaultConsultingContract();
  const prompt = assembleDesignSystemPrompt(contract);
  if (!prompt || prompt.length < 40) throw new Error("design prompt too short");
  ok("assembleDesignSystemPrompt");

  const tokens = contractToThemeTokens(contract);
  if (!tokens.colors?.accent) throw new Error("contractToThemeTokens missing accent");
  ok("contractToThemeTokens (pptd-compatible shape)");

  const extracted = extractThemeFromHints("Finance deck, accent #0B3D91, Inter");
  if (!extracted) throw new Error("extractThemeFromHints returned empty");
  ok("extractThemeFromHints");
} catch (err) {
  fail("design-brain", err);
  console.error("    Hint: npm run build -w @open-slidestudio/design-brain");
}

// ── End-to-end: MockProvider → same PPTD → exporter-pptx ────────────
console.log("\nvertical-slice (generate → export same deck)");
try {
  const agent = await importPkg(
    "@open-slidestudio/agent-core",
    "packages/agent-core/dist/index.js",
  );
  const exp = await importPkg(
    "@open-slidestudio/exporter-pptx",
    "packages/exporter-pptx/dist/index.js",
  );
  const pptd = await importPkg(
    "@open-slidestudio/pptd",
    "packages/pptd/dist/index.js",
  );
  const { generateDeck, refineDeck, MockProvider, createAgentRun } = agent;
  const { exportDeckToArrayBuffer } = exp;
  const { parseDeck } = pptd;

  const provider = new MockProvider({ baseDelayMs: 0 });
  const result = await generateDeck(
    {
      prompt: "Smoke test research briefing on offline demos",
      title: "Smoke Deck",
      mockSpeed: 0,
      modelId: "mock-offline",
    },
    { provider },
  );

  if (result.versionLabel !== "V1") throw new Error(`expected V1 got ${result.versionLabel}`);
  if (!result.deck?.slides?.length) throw new Error("no slides on generate");
  if (result.deck.meta?.product && /kimi/i.test(String(result.deck.meta.product))) {
    throw new Error("deck meta must not use KIMI product branding");
  }
  parseDeck(result.deck);
  ok(`generateDeck → ${result.deck.slides.length} slides, ${result.versionLabel}`);

  // Critical: export the SAME deck object, not a separate sample fixture.
  const out = await exportDeckToArrayBuffer(result.deck);
  if (!out?.data) throw new Error("export returned no data");
  const bytes =
    out.data instanceof ArrayBuffer
      ? out.data.byteLength
      : out.data instanceof Uint8Array
        ? out.data.byteLength
        : Buffer.isBuffer?.(out.data)
          ? out.data.length
          : 0;
  if (bytes < 1000) throw new Error(`pptx too small (${bytes} bytes)`);
  // ZIP magic "PK"
  const head = new Uint8Array(
    out.data instanceof ArrayBuffer
      ? out.data.slice(0, 2)
      : out.data.buffer.slice(out.data.byteOffset, out.data.byteOffset + 2),
  );
  if (head[0] !== 0x50 || head[1] !== 0x4b) {
    throw new Error("export is not a ZIP/PPTX container");
  }
  if (!out.report) throw new Error("missing export report");
  // Soft image/path degradations are allowed; hard mapper errors are not.
  const hardKinds = new Set(["error", "unsupported-element"]);
  const hardLoss = (out.report.degradations ?? []).filter((d) =>
    hardKinds.has(d.kind),
  );
  if (hardLoss.length > 0) {
    throw new Error(
      `export report has hard degradations: ${hardLoss.map((d) => d.kind).join(",")}`,
    );
  }
  if ((out.report.elementCounts?.failed ?? 0) > 2) {
    throw new Error(
      `too many failed elements: ${out.report.elementCounts.failed}`,
    );
  }
  ok(
    `export same generated deck (${bytes} bytes, slides=${result.deck.slides.length}, mime=${out.mimeType})`,
  );

  const refined = await refineDeck(
    {
      deck: result.deck,
      versionNumber: result.versionNumber,
      versionId: result.versionId,
    },
    "Add a risks and mitigations slide",
    { provider: new MockProvider({ baseDelayMs: 0 }), mockSpeed: 0 },
  );
  if (refined.versionNumber !== result.versionNumber + 1) {
    throw new Error("refinement did not bump version");
  }
  parseDeck(refined.deck);
  const refinedOut = await exportDeckToArrayBuffer(refined.deck);
  const refinedBytes =
    refinedOut.data instanceof ArrayBuffer
      ? refinedOut.data.byteLength
      : refinedOut.data?.byteLength ?? 0;
  if (refinedBytes < 1000) throw new Error("refined export too small");
  ok(`refineDeck → ${refined.versionLabel} + export (${refinedBytes} bytes)`);

  // createAgentRun requires injected provider (web composition-root path)
  const run = createAgentRun(
    { prompt: "Quick smoke", mockSpeed: 0, modelId: "mock-offline" },
    { provider: new MockProvider({ baseDelayMs: 0 }), autoStart: true },
  );
  const waited = await run.wait();
  if (run.status !== "ready") throw new Error(`status ${run.status}`);
  if (!waited.deck) throw new Error("wait() missing deck");
  ok("createAgentRun + wait with injected MockProvider");
} catch (err) {
  fail("vertical-slice", err);
  console.error(
    "    Hint: build all packages first: npm run build",
  );
}

// ── Summary ─────────────────────────────────────────────────────────
console.log("\n────────────────────────────────────");
if (failed) {
  console.error(`Smoke check FAILED (${failed} package group(s)).`);
  console.error("Build libraries first: npm run build");
  process.exit(1);
}

console.log("Smoke check PASSED (offline mock flow OK).");
console.log(`
Next steps:
  npm run dev          # apps/web at http://localhost:5173
  npm test             # package unit tests
  npm run typecheck    # all workspaces with typecheck script
`);
process.exit(0);
