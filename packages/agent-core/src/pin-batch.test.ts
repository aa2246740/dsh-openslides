import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPinBatchToDeck,
  formatPinBatchInstruction,
  resolvePinPoint,
  processPinBatch,
  generateDeck,
  MockProvider,
} from "./index.js";
import type { Deck, TextElement } from "@open-slidestudio/pptd";

const BRIEF =
  "为经营委员会写一版 Q3 区域增长决策材料：华北贡献、试点 vs 全量、本周动作。";

function firstText(deck: Deck): { slideId: string; el: TextElement } {
  for (const s of deck.slides) {
    const el = s.elements.find((e): e is TextElement => e.kind === "text");
    if (el) return { slideId: s.id, el };
  }
  throw new Error("no text");
}

describe("pin batch (agent work orders)", () => {
  it("formats batch instruction with pin coordinates", () => {
    const text = formatPinBatchInstruction([
      { id: "p1", slideId: "s1", x: 100, y: 200, text: "加强结论" },
    ]);
    assert.match(text, /scoped edits/i);
    assert.match(text, /p1/);
    assert.match(text, /加强结论/);
  });

  it("resolvePinPoint uses slide size (portrait-safe)", () => {
    const slide = {
      id: "s",
      order: 0,
      size: { width: 1080, height: 1920 },
      elements: [],
    };
    const abs = resolvePinPoint(slide as never, { x: 200, y: 1500 });
    assert.equal(abs.W, 1080);
    assert.equal(abs.H, 1920);
    assert.equal(abs.px, 200);
    assert.equal(abs.py, 1500);

    const norm = resolvePinPoint(slide as never, { x: 0.5, y: 0.5 });
    assert.equal(norm.px, 540);
    assert.equal(norm.py, 960);
  });

  it("edits nearest text (not sticker); fails empty / missing slide; no version if all fail", async () => {
    const gen = await generateDeck(
      { prompt: BRIEF, mockSpeed: 0 },
      { provider: new MockProvider({ baseDelayMs: 0 }) },
    );
    const { slideId, el } = firstText(gen.deck);
    const before = el.paragraphs[0]!.runs[0]!.text;

    const applied = applyPinBatchToDeck(gen.deck, [
      {
        id: "ok1",
        slideId,
        x: el.x + 10,
        y: el.y + 10,
        text: "华北贡献仍是主引擎",
      },
      { id: "bad-empty", slideId, x: 10, y: 10, text: "   " },
      {
        id: "bad-slide",
        slideId: "missing-slide-id",
        x: 10,
        y: 10,
        text: "nowhere",
      },
    ]);

    assert.deepEqual(applied.succeededPinIds, ["ok1"]);
    assert.equal(applied.failedPins.length, 2);
    assert.equal(applied.versionBumped, true);
    assert.ok(applied.version);
    assert.equal(applied.version!.versionNumber, gen.versionNumber + 1);

    const slide = applied.deck.slides.find((s) => s.id === slideId)!;
    const texts = slide.elements
      .filter((e): e is TextElement => e.kind === "text")
      .map((e) => e.paragraphs[0]?.runs[0]?.text ?? "");
    assert.ok(
      texts.some((t) => t.includes("华北贡献仍是主引擎")),
      `expected edited text, got ${texts.join(" | ")}`,
    );
    assert.ok(!texts.some((t) => t.startsWith("✎ ")), "no sticker callouts");
    assert.notEqual(
      texts.find((t) => t.includes("华北贡献仍是主引擎")),
      before,
    );

    const allFail = applyPinBatchToDeck(gen.deck, [
      { id: "e1", slideId, x: 0, y: 0, text: "" },
      {
        id: "e2",
        slideId: "nope",
        x: 1,
        y: 1,
        text: "x",
      },
    ]);
    assert.equal(allFail.versionBumped, false);
    assert.equal(allFail.version, null);
    assert.equal(allFail.succeededPinIds.length, 0);
    assert.equal(allFail.deck.versionId, gen.deck.versionId);
  });

  it("title change targets large text; processPinBatch returns pinBatch", async () => {
    const gen = await generateDeck(
      { prompt: BRIEF, mockSpeed: 0 },
      { provider: new MockProvider({ baseDelayMs: 0 }) },
    );
    const slide = gen.deck.slides[0]!;
    const titleEl = slide.elements.find(
      (e): e is TextElement =>
        e.kind === "text" &&
        e.paragraphs.some((p) => (p.runs[0]?.fontSize ?? 0) >= 28),
    );
    assert.ok(titleEl, "cover needs large title text");

    const result = await processPinBatch(
      {
        deck: gen.deck,
        versionNumber: gen.versionNumber,
        versionId: gen.versionId,
      },
      [
        {
          id: "pin-a",
          slideId: slide.id,
          x: titleEl.x + 20,
          y: titleEl.y + 20,
          text: "标题改为：试点先于全量",
        },
      ],
      { provider: new MockProvider({ baseDelayMs: 0 }), mockSpeed: 0 },
    );

    assert.equal(result.versionNumber, gen.versionNumber + 1);
    assert.ok(result.pinBatch);
    assert.deepEqual(result.pinBatch?.succeededPinIds, ["pin-a"]);
    assert.equal(result.pinBatch?.failedPins.length, 0);
    const after = result.deck.slides[0]!.elements.find(
      (e) => e.id === titleEl.id,
    ) as TextElement;
    assert.match(after.paragraphs[0]!.runs[0]!.text, /试点先于全量/);
  });

  it("processPinBatch all-fail keeps version number", async () => {
    const gen = await generateDeck(
      { prompt: BRIEF, mockSpeed: 0 },
      { provider: new MockProvider({ baseDelayMs: 0 }) },
    );
    const result = await processPinBatch(
      {
        deck: gen.deck,
        versionNumber: gen.versionNumber,
        versionId: gen.versionId,
      },
      [
        {
          id: "x",
          slideId: "missing",
          x: 10,
          y: 10,
          text: "nope",
        },
      ],
      { provider: new MockProvider({ baseDelayMs: 0 }), mockSpeed: 0 },
    );
    assert.equal(result.versionNumber, gen.versionNumber);
    assert.equal(result.versionId, gen.versionId);
    assert.equal(result.pinBatch?.succeededPinIds.length, 0);
    assert.equal(result.pinBatch?.failedPins.length, 1);
  });
});
