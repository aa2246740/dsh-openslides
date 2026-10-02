import assert from "node:assert/strict";
import test from "node:test";
import { canonicalWritePageIssues, isCanonicalWritePageArgs, normalizeWritePageLineArrows, normalizeWritePageDialect } from "./write-page-schema.js";

const base = (elementType: string, extra: Record<string, unknown>) => ({
  elementId: `${elementType}-1`,
  elementType,
  bounds: [10, 20, 300, 120],
  ...extra,
});

test("accepts all seven canonical PPTD element branches", () => {
  const args = {
    id: "page-1",
    pageType: "content",
    background: { type: "solid", color: "#F7F3EA" },
    notes: "Keep this note through whole-page replacement.",
    elements: [
      base("text", {
        layoutRole: "content",
        content: {
          text: '<p><span style="color:#123456">Title</span></p>',
          style: "$title",
          fontSize: 50,
          fontFamily: { latin: "Inter", ea: "MiSans" },
          color: "#123456",
          align: ["center", "middle"],
        },
      }),
      base("shape", {
        shapeName: "rect",
        fill: { type: "solid", color: "#FFFFFF" },
        border: { style: "solid", width: 1, color: "#000000" },
        adjustments: [0.5],
      }),
      base("image", {
        src: "media/hero.png",
        fit: { mode: "cover" },
        crop: { left: 0.1, top: 0.1, right: 0.1, bottom: 0.1 },
        cropShape: { shapeName: "roundRect", adjustments: [0.2] },
      }),
      base("table", {
        columnWidths: [120, 180],
        rowHeights: [36],
        rows: [[{ text: "A" }, { text: "B", bold: true, align: ["right", "middle"] }]],
      }),
      base("chart", {
        data: { cols: ["name", "value"], rows: [["A", 1]] },
        series: [{ type: "bar", encode: { item: "name", y: "value" }, axis: "primary" }],
        background: { type: "solid", color: "#FFFFFF" },
        title: { text: "Chart" },
        legend: { position: "bottom" },
      }),
      base("icon", { iconName: "check", fill: { type: "solid", color: "#00AA00" } }),
      base("line", {
        viewBox: [300, 120],
        points: "M0 0 L300 120",
        border: { width: 2, color: "#000000" },
        arrow: [null, "stealth"],
        connects: ["shape-1", "text-1"],
      }),
    ],
    animations: [
      {
        elementId: "text-1",
        effect: "fade-in",
        trigger: "afterPrevious",
        direction: "up",
        durationMs: 500,
        delayMs: 100,
      },
    ],
  };
  assert.deepEqual(canonicalWritePageIssues(args), []);
  assert.equal(isCanonicalWritePageArgs(args), true);
  assert.deepEqual(
    canonicalWritePageIssues({
      id: "legacy-animation-reference",
      elements: [base("text", { content: { text: "Still writable" } })],
      animations: [{ elementId: "removed-element", effect: "fade-in" }],
    }),
    [],
  );
});

test("accepts a quoted null string as a missing line arrow head", () => {
  const args = {
    id: "page-1",
    elements: [
      base("line", {
        viewBox: [220, 30],
        points: "M0 15 L220 15",
        arrow: ["null", "arrow"],
      }),
    ],
  };
  assert.deepEqual(canonicalWritePageIssues(args), []);
  const rec = args as unknown as Record<string, unknown>;
  normalizeWritePageLineArrows(rec);
  const elements = rec.elements as Array<Record<string, unknown>>;
  assert.equal(elements.length, 1);
  assert.deepEqual(elements[0]?.arrow, [null, "arrow"]);
});

test("accepts an empty object as a missing line arrow head", () => {
  const args = {
    id: "page-1",
    elements: [
      base("line", {
        viewBox: [220, 30],
        points: "M0 15 L220 15",
        arrow: [{}, "arrow"],
      }),
    ],
  };
  assert.deepEqual(canonicalWritePageIssues(args), []);
  const rec = args as unknown as Record<string, unknown>;
  normalizeWritePageLineArrows(rec);
  const elements = rec.elements as Array<Record<string, unknown>>;
  assert.deepEqual(elements[0]?.arrow, [null, "arrow"]);
});

test("unwraps MiniMax { $text } fontFamily before schema validation", () => {
  const args = {
    id: "cover",
    elements: [
      base("text", {
        content: {
          text: "从一台原型机到百年品牌",
          fontFamily: { $text: "Microsoft YaHei" },
          color: "#2C2C2C",
          fontSize: 14,
        },
      }),
    ],
  };
  assert.ok(canonicalWritePageIssues(args).some((issue) => issue.includes("fontFamily")));
  const rec = args as unknown as Record<string, unknown>;
  normalizeWritePageDialect(rec);
  assert.deepEqual(canonicalWritePageIssues(rec), []);
  const elements = rec.elements as Array<{ content: { fontFamily: string } }>;
  assert.equal(elements[0]?.content.fontFamily, "Microsoft YaHei");
});

test("rejects the b7 nested content.style shape instead of dropping it", () => {
  const args = {
    id: "cover",
    elements: [
      base("text", {
        content: {
          text: "勾股定理",
          style: { fontSize: 50, color: "#5C4630", fontFamily: "MiSans" },
        },
      }),
    ],
  };
  assert.deepEqual(canonicalWritePageIssues(args), [
    "$.elements[0].content.style must be a string (received object)",
  ]);
});

test("reports actual JSON types for numeric text without echoing arbitrary content", () => {
  const secret = "private slide copy that must never be echoed in a validation error";
  const issues = canonicalWritePageIssues({
    id: "typed-errors",
    elements: [
      base("text", { content: { text: 1 } }),
      base("text", { content: { text: true } }),
      base("text", { content: { text: null } }),
      base("text", { content: { text: "safe", fontSize: secret } }),
    ],
  });
  assert.deepEqual(issues, [
    "$.elements[0].content.text must be a string (received number)",
    "$.elements[1].content.text must be a string (received boolean)",
    "$.elements[2].content.text must be a string (received null)",
    "$.elements[3].content.fontSize must be a finite JSON number (received string)",
  ]);
  assert.equal(issues.join("\n").includes(secret), false);
});

test("accepts declared shape aliases and rejects unknown shapes only on new writes", () => {
  assert.deepEqual(
    canonicalWritePageIssues({
      id: "alias-shape",
      elements: [
        base("shape", {
          shapeName: "rectangle",
          fill: { type: "solid", color: "#123456" },
        }),
      ],
    }),
    [],
  );
  const issues = canonicalWritePageIssues({
    id: "unknown-shape",
    elements: [
      base("shape", {
        shapeName: "unknown-inset-placeholder",
        fill: { type: "solid", color: "#123456" },
      }),
    ],
  });
  assert.equal(issues.length, 1);
  assert.match(issues[0] ?? "", /^\$\.elements\[0\]\.shapeName must be one of /);
});

test("requires non-empty elements, exact bounds, unique ids, and branch fields", () => {
  assert.deepEqual(canonicalWritePageIssues({ id: "empty", elements: [] }), ["$.elements must not be empty"]);
  const tupleIssues = canonicalWritePageIssues({
    id: "bad",
    elements: [
      base("text", { bounds: [0, 0, 10], content: { text: "one" } }),
      base("text", { bounds: [0, 0, -10, 20], content: { text: "two" } }),
    ],
  });
  assert.ok(tupleIssues.includes("$.elements[0].bounds must contain exactly 4 numbers"));
  assert.ok(tupleIssues.includes("$.elements[1].elementId must be unique"));
  assert.ok(tupleIssues.includes("$.elements[1].bounds width and height must be positive"));
  assert.deepEqual(canonicalWritePageIssues({ id: "image", elements: [base("image", {})] }), [
    "$.elements[0].src is required",
  ]);
  assert.deepEqual(
    canonicalWritePageIssues({
      id: "table",
      elements: [
        base("table", {
          columnWidths: [120, 0],
          rowHeights: [-1],
          rows: [[{ text: "A", rowSpan: 0 }, { text: "B", colSpan: -1 }]],
        }),
      ],
    }),
    [
      "$.elements[0].columnWidths[1] must be positive",
      "$.elements[0].rows[0][0].rowSpan must be at least 1",
      "$.elements[0].rows[0][1].colSpan must be at least 1",
      "$.elements[0].rowHeights[0] must be positive",
    ],
  );
});

test("rejects unknown generation fields at every canonical object boundary", () => {
  const issues = canonicalWritePageIssues({
    id: "unknown",
    arguments: {},
    elements: [base("text", { content: { text: "Title", font_size: 50 }, fontSize: 50 })],
  });
  assert.ok(issues.includes("$.arguments is not allowed"));
  assert.ok(issues.includes("$.elements[0].fontSize is not allowed"));
  assert.ok(issues.includes("$.elements[0].content.font_size is not allowed"));
});

test("keeps chart series fill and encode aligned with the native type", () => {
  assert.deepEqual(
    canonicalWritePageIssues({
      id: "chart",
      elements: [
        base("chart", {
          data: { cols: ["name", "value"], rows: [["A", 1]] },
          series: [{ type: "bar", fill: { type: "solid", color: "#FFFFFF" } }],
        }),
      ],
    }),
    ["$.elements[0].series[0].fill does not match any schema branch"],
  );
  assert.deepEqual(
    canonicalWritePageIssues({
      id: "chart",
      elements: [
        base("chart", {
          data: { cols: ["name", "value"], rows: [["A", 1]] },
          series: [{ type: "bar", fill: "#FFFFFF", encode: { x: "name", y: 1 } }],
        }),
      ],
    }),
    ["$.elements[0].series[0].encode.y must be a string (received number)"],
  );
});

test("rejects empty gradients at every page, table, and chart fill location", () => {
  const emptyGradient = {
    type: "gradient",
    gradientType: "linear",
    stops: [],
  };
  assert.deepEqual(
    canonicalWritePageIssues({
      id: "gradient",
      background: emptyGradient,
      elements: [
        base("table", {
          columnWidths: [100],
          rows: [[{ text: "A", fill: emptyGradient }]],
        }),
        base("chart", {
          data: { cols: ["name", "value"], rows: [["A", 1]] },
          series: [{ type: "bar", fill: emptyGradient }],
        }),
      ],
    }),
    [
      "$.background.stops must not be empty",
      "$.elements[0].rows[0][0].fill.stops must not be empty",
      "$.elements[1].series[0].fill.stops must not be empty",
    ],
  );
});
