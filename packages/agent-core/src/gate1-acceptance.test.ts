/**
 * Gate 1 demo path acceptance (OOP-11) — S1 + S2 seams in agent-core/pptd.
 * PPTX export coverage lives in exporter-pptx + scripts/gate1-acceptance.mjs.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCommand,
  cmdUpdateChartData,
  cmdUpdateElement,
  undoCommand,
  type ChartElement,
  type TextElement,
} from "@open-slidestudio/pptd";
import {
  generateDeck,
  refineDeck,
  processPinBatch,
  MockProvider,
} from "./index.js";

const BRIEF =
  "为经营委员会写一版 Q3 区域增长决策材料：华北贡献、试点 vs 全量、本周动作。";

describe("Gate 1 demo acceptance path", () => {
  it("generate → edit chart/text + undo → refine → pin batch", async () => {
    const gen = await generateDeck(
      { prompt: BRIEF, mockSpeed: 0 },
      { provider: new MockProvider({ baseDelayMs: 0 }) },
    );
    assert.ok(gen.deck.slides.length >= 5);
    assert.equal(gen.versionLabel, "V1");
    assert.ok(gen.steps.some((s) => s.tool === "compose_deck"));
    const titleBlob = gen.deck.slides
      .flatMap((s) =>
        s.elements
          .filter((e): e is TextElement => e.kind === "text")
          .flatMap((e) => e.paragraphs.flatMap((p) => p.runs.map((r) => r.text))),
      )
      .join(" ");
    assert.ok(/华北|试点|增长|本周/.test(titleBlob));

    const chartSlide = gen.deck.slides.find((s) =>
      s.elements.some((e) => e.kind === "chart"),
    );
    assert.ok(chartSlide);
    const chart = chartSlide!.elements.find((e) => e.kind === "chart") as ChartElement;
    const chartRes = applyCommand(
      gen.deck,
      cmdUpdateChartData(chartSlide!.id, chart.id, {
        categories: chart.categories,
        series: chart.series.map((s, i) =>
          i === 0 ? { ...s, values: s.values.map((v) => v + 1) } : s,
        ),
      }),
    );
    const afterChart = chartRes.deck.slides
      .find((s) => s.id === chartSlide!.id)!
      .elements.find((e) => e.id === chart.id) as ChartElement;
    assert.notDeepEqual(afterChart.series[0]?.values, chart.series[0]?.values);

    const chartTextEl = chartSlide!.elements.find((e) => e.kind === "text") as
      | TextElement
      | undefined;
    if (chartTextEl) {
      const textRes = applyCommand(
        chartRes.deck,
        cmdUpdateElement(chartSlide!.id, chartTextEl.id, {
          paragraphs: [
            {
              runs: [
                {
                  text: "华北贡献仍是主引擎",
                  fontSize: chartTextEl.paragraphs[0]?.runs[0]?.fontSize ?? 28,
                  fontWeight: 700,
                },
              ],
            },
          ],
        }),
      );
      undoCommand(textRes.deck, textRes.command);
    }
    const restored = undoCommand(chartRes.deck, chartRes.command);
    const restoredChart = restored.slides
      .find((s) => s.id === chartSlide!.id)!
      .elements.find((e) => e.id === chart.id) as ChartElement;
    assert.deepEqual(restoredChart.series[0]?.values, chart.series[0]?.values);

    const refined = await refineDeck(
      {
        deck: gen.deck,
        versionNumber: gen.versionNumber,
        versionId: gen.versionId,
      },
      "把封面结论写得更尖锐",
      { provider: new MockProvider({ baseDelayMs: 0 }), mockSpeed: 0 },
    );
    assert.equal(refined.versionNumber, gen.versionNumber + 1);
    assert.notEqual(refined.versionId, gen.versionId);

    const cover = refined.deck.slides[0]!;
    const textEl = cover.elements.find((e) => e.kind === "text");
    assert.ok(textEl, "cover has text to edit via pin");
    const pins = await processPinBatch(
      {
        deck: refined.deck,
        versionNumber: refined.versionNumber,
        versionId: refined.versionId,
      },
      [
        {
          id: "demo-pin",
          slideId: cover.id,
          x: textEl.x + 8,
          y: textEl.y + 8,
          text: "补充：本周必须锁定试点名单",
        },
      ],
      { provider: new MockProvider({ baseDelayMs: 0 }), mockSpeed: 0 },
    );
    assert.equal(pins.versionNumber, refined.versionNumber + 1);
    assert.deepEqual(pins.pinBatch?.succeededPinIds, ["demo-pin"]);
    assert.ok(pins.pinBatch, "pinBatch meta required");
  });
});
