import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalShapeName,
  isSupportedShapeName,
  SHAPE_ALIASES,
  SHAPE_CATALOG,
  SHAPE_BY_NAME,
  SUPPORTED_SHAPE_NAMES,
} from "./shape-catalog.js";
import { shapeGeometry, shapePath } from "./shape-path.js";

describe("official shape catalog", () => {
  it("has 177 unique official shapeNames", () => {
    assert.equal(SHAPE_CATALOG.length, 177);
    assert.equal(SHAPE_BY_NAME.size, 177);
  });

  it("every catalog shape emits an SVG path", () => {
    for (const s of SHAPE_CATALOG) {
      const d = shapePath(s.name, s.defaults);
      assert.ok(d.length > 4, s.name);
      assert.match(d, /[ML]/);
    }
  });

  it("covers the official 14 insert-gallery groups", () => {
    const groups = new Set(SHAPE_CATALOG.map((s) => s.group));
    for (const g of [
      "Basic Shapes",
      "Rectangle Variants",
      "Stars and Bursts",
      "Arrow Shapes",
      "Arrow Callouts",
      "Callouts",
      "Brackets and Braces",
      "Ribbons",
      "Scrolls",
      "Math Symbols",
      "Chart Shapes",
      "Tab Shapes",
      "Action Buttons",
      "Flowchart Shapes",
    ]) {
      assert.ok(groups.has(g), g);
    }
    assert.equal(groups.size, 14);
  });

  it("renders the supported rectangle alias with the exact canonical geometry", () => {
    assert.deepEqual(SHAPE_ALIASES, { rectangle: "rect" });
    assert.equal(SUPPORTED_SHAPE_NAMES.length, 178);
    assert.equal(canonicalShapeName("rectangle"), "rect");
    assert.equal(isSupportedShapeName("rectangle"), true);
    assert.equal(isSupportedShapeName("unknown-inset-placeholder"), false);
    assert.equal(shapePath("rectangle"), "M 0 0 L 100 0 L 100 100 L 0 100 Z");
    assert.equal(shapePath("rectangle"), shapePath("rect"));
    assert.deepEqual(shapeGeometry("rectangle"), shapeGeometry("rect"));
  });
});
