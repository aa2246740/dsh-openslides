import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChartElement } from "./types.js";
import {
  categoricalChartModel,
  chartKind,
  placeScatterLabels,
  scatterChartModel,
  waterfallChartModel,
} from "./chart-semantics.js";

describe("chart semantics", () => {
  it("honors reversed bar encodings as a horizontal chart", () => {
    const chart = {
      data: {
        cols: ["区域", "金额"],
        rows: [
          ["华东", 4887],
          ["华南", 2829],
          ["华北", 2315],
        ],
      },
      series: [
        { type: "bar", name: "金额", encode: { x: "金额", y: "区域" } },
      ],
    } as Pick<ChartElement, "data" | "series">;

    const model = categoricalChartModel(chart);

    assert.equal(model.kind, "bar");
    assert.equal(model.orientation, "horizontal");
    assert.deepEqual(model.categories, ["华东", "华南", "华北"]);
    assert.deepEqual(model.series[0]?.values, [4887, 2829, 2315]);
    assert.ok(model.valueMax >= 4887 && model.valueMax <= 5000);
  });

  it("uses every series' declared value column", () => {
    const chart = {
      data: {
        cols: ["层级", "人数pct", "收入pct"],
        rows: [
          ["黑金", 2.8, 22],
          ["金卡", 8.6, 28],
        ],
      },
      series: [
        { type: "bar", name: "人数%", encode: { x: "层级", y: "人数pct" } },
        { type: "bar", name: "收入%", encode: { x: "层级", y: "收入pct" } },
      ],
    } as Pick<ChartElement, "data" | "series">;

    const model = categoricalChartModel(chart);

    assert.equal(model.orientation, "vertical");
    assert.deepEqual(model.categories, ["黑金", "金卡"]);
    assert.deepEqual(model.series.map((series) => series.values), [
      [2.8, 8.6],
      [22, 28],
    ]);
  });

  it("keeps each combination series kind and value axis", () => {
    const chart = {
      data: {
        cols: ["月", "新增", "复购率"],
        rows: [
          ["6月", 11.2, 25.8],
          ["7月", 12.8, 26.4],
        ],
      },
      series: [
        { type: "bar", name: "新增", encode: { x: "月", y: "新增" } },
        {
          type: "line",
          name: "复购率",
          encode: { x: "月", y: "复购率" },
          axis: "secondary",
        },
      ],
    } as Pick<ChartElement, "data" | "series">;

    const model = categoricalChartModel(chart);

    assert.deepEqual(
      model.series.map((series) => ({ kind: series.kind, axis: series.axis })),
      [
        { kind: "bar", axis: "primary" },
        { kind: "line", axis: "secondary" },
      ],
    );
  });

  it("keeps a derived cash-flow subtotal on the opening-cash baseline", () => {
    const chart = {
      data: {
        cols: ["步", "额", "tot"],
        rows: [
          ["期初现金", 5280, null],
          ["经营流入", 12210, null],
          ["经营流出", -10860, null],
          ["经营净额", 1350, null],
          ["投资", -486, null],
          ["筹资", -180, null],
          ["期末", 5964, null],
        ],
      },
      series: [{ type: "waterfall", encode: { x: "步", y: "额", isTotal: "tot" } }],
    } as Pick<ChartElement, "data" | "series">;

    const model = waterfallChartModel(chart);

    assert.equal(chartKind(chart), "waterfall");
    assert.deepEqual(model.bars[3], {
      label: "经营净额",
      value: 1350,
      start: 5280,
      end: 6630,
      kind: "subtotal",
    });
    assert.deepEqual(model.bars[4], {
      label: "投资",
      value: -486,
      start: 6630,
      end: 6144,
      kind: "decrease",
    });
    assert.ok(model.valueMax >= 17490 && model.valueMax <= 20000);
    assert.ok(model.valueMin <= 5280 && model.valueMin >= 0);
    assert.equal(model.scale.step % 1 === 0 || model.scale.step < 1, true);
    assert.equal(model.bars.at(-1)?.end, 5964);
  });

  it("uses scatter encode columns and preserves point labels", () => {
    const chart = {
      data: {
        cols: ["风险", "可能", "影响"],
        rows: [
          ["爆品缺货", 4.5, 4.8],
          ["华北同店", 4.2, 4.5],
        ],
      },
      series: [{ type: "scatter", encode: { x: "可能", y: "影响" } }],
    } as Pick<ChartElement, "data" | "series">;

    const model = scatterChartModel(chart);

    assert.equal(chartKind(chart), "scatter");
    assert.equal(model.xName, "可能");
    assert.equal(model.yName, "影响");
    assert.deepEqual(model.points[0], { label: "爆品缺货", x: 4.5, y: 4.8 });
    assert.ok(model.xMax >= 4.5 && model.xMax <= 5);
    assert.ok(model.yMax >= 4.8 && model.yMax <= 5.5);
  });

  it("places clustered scatter labels without overlapping boxes", () => {
    const placements = placeScatterLabels(
      [
        { label: "爆品缺货", x: 352, y: 34 },
        { label: "华北同店", x: 333, y: 52 },
        { label: "一线离职", x: 307, y: 129 },
        { label: "抖音ROI", x: 320, y: 150 },
        { label: "茶叶成本", x: 288, y: 164 },
      ],
      { left: 2, top: 4, right: 398, bottom: 336 },
    );
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        const left = placements[i]!.box;
        const right = placements[j]!.box;
        const overlapWidth = Math.max(
          0,
          Math.min(left.right, right.right) - Math.max(left.left, right.left),
        );
        const overlapHeight = Math.max(
          0,
          Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
        );
        assert.equal(overlapWidth * overlapHeight, 0);
      }
    }
  });
});

describe("waterfall value domain", () => {
  const bridge = {
    data: {
      cols: ["步", "pct", "tot"],
      rows: [
        ["6 月", 37.5, null],
        ["原料", -0.8, null],
        ["茶饮结构", 0.6, null],
        ["损耗", 0.3, null],
        ["促销", -0.2, null],
        ["7 月", 37.8, null],
      ],
    },
    series: [{ type: "waterfall", encode: { x: "步", y: "pct", isTotal: "tot" } }],
  } as never;

  it("spans the floating extents so small deltas stay readable", () => {
    const model = waterfallChartModel(bridge as Parameters<typeof waterfallChartModel>[0]);
    assert.ok(model.valueMin <= 36.6 && model.valueMin >= 30);
    assert.ok(model.valueMax >= 37.8 && model.valueMax <= 45);
    assert.ok(model.scale.step <= 2, "small bridge needs a step of 2 or less");
  });

  it("tightens the domain even for a simple build so deltas stay visible", () => {
    const chart = {
      data: {
        cols: ["步", "额"],
        rows: [
          ["期初", 100],
          ["流入", 50],
          ["期末", 150],
        ],
      },
      series: [{ type: "waterfall", encode: { x: "步", y: "额" } }],
    } as unknown as Parameters<typeof waterfallChartModel>[0];
    const model = waterfallChartModel(chart);
    assert.ok(model.valueMin <= 100);
    assert.ok(model.valueMax >= 150);
    assert.ok(model.valueMax - model.valueMin <= 200);
  });
});
