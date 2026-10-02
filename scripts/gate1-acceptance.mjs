/**
 * Gate 1 end-to-end acceptance (generate → refine → export PPTX).
 * Run: node scripts/gate1-acceptance.mjs
 * Requires workspace packages built.
 */

import assert from "node:assert/strict";
import {
  generateDeck,
  refineDeck,
  MockProvider,
} from "../packages/agent-core/dist/index.js";
import { exportDeckToArrayBuffer } from "../packages/exporter-pptx/dist/index.js";

const BRIEF =
  "为经营委员会写一版 Q3 区域增长决策材料：华北贡献、试点 vs 全量、本周动作。";

const gen = await generateDeck(
  { prompt: BRIEF, mockSpeed: 0 },
  { provider: new MockProvider({ baseDelayMs: 0 }) },
);
assert.ok(gen.deck.slides.length >= 5, "multi-slide deck");
assert.equal(gen.versionLabel, "V1");

const refined = await refineDeck(
  {
    deck: gen.deck,
    versionNumber: gen.versionNumber,
    versionId: gen.versionId,
  },
  "强化封面主张",
  { provider: new MockProvider({ baseDelayMs: 0 }), mockSpeed: 0 },
);
assert.equal(refined.versionNumber, 2);

const exported = await exportDeckToArrayBuffer(refined.deck);
assert.ok(exported.data.byteLength > 2000, "pptx bytes");
assert.ok(exported.report.nativeCoverage > 0, "native coverage");
assert.ok(exported.report.slideCount >= 5);

console.log("Gate1 acceptance OK", {
  slides: refined.deck.slides.length,
  version: refined.versionLabel,
  pptxBytes: exported.data.byteLength,
  nativeCoverage: exported.report.nativeCoverage,
  degradations: exported.report.degradations.length,
});
