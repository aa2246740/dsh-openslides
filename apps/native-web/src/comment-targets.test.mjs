import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  annotationBox,
  annotationPoint,
  annotationTargetsInBox,
  isAnnotationTarget,
  reviewCacheKey,
} from "../public/comment-targets.js";

const SIZE = [960, 540];
const text = (id, bounds, extra = {}) => ({ id, type: "text", bounds, ...extra });

describe("annotation target picking", () => {
  it("keeps each deck's comments under its own cache key", () => {
    const a = reviewCacheKey("output/dsh-slices/做一份极简苹果风格的-介绍-的产品历史的-39d80dc0", "pages/p1.page");
    const b = reviewCacheKey("output/dsh-slices/做一份极简苹果风格的-介绍-的产品历史的-9c10c0c9", "pages/p1.page");
    assert.notEqual(a, b);
    assert.equal(a, reviewCacheKey("output/dsh-slices/做一份极简苹果风格的-介绍-的产品历史的-39d80dc0", "pages/p1.page"));
    assert.notEqual(a, reviewCacheKey("output/dsh-slices/做一份极简苹果风格的-介绍-的产品历史的-39d80dc0", "pages/p2.page"));
  });

  it("accepts real content and rejects invisible or full-slide layers", () => {
    assert.equal(isAnnotationTarget(text("title", [80, 60, 800, 40]), SIZE), true);
    assert.equal(isAnnotationTarget(text("title", [80, 60, 800, 40], { hidden: true }), SIZE), false);
    assert.equal(isAnnotationTarget(text("title", [80, 60, 0, 40]), SIZE), false);
    assert.equal(isAnnotationTarget(text("missing", undefined), SIZE), false);
    // A page-sized backdrop is not what the user meant to click.
    assert.equal(isAnnotationTarget({ id: "bg", type: "shape", bounds: [0, 0, 960, 540] }, SIZE), false);
    assert.equal(isAnnotationTarget({ id: "band", type: "shape", bounds: [0, 0, 960, 120] }, SIZE), true);
  });

  it("maps client pixels into slide units at any zoom", () => {
    const rect = { left: 100, top: 50, width: 1920, height: 1080 };
    assert.deepEqual(annotationPoint(100, 50, rect, SIZE), [0, 0]);
    assert.deepEqual(annotationPoint(1060, 590, rect, SIZE), [480, 270]);
    assert.deepEqual(annotationPoint(1960, 1130, rect, SIZE), [930, 540]);
    assert.deepEqual(annotationBox([300, 200], [100, 260]), [100, 200, 200, 60]);
  });

  it("selects every crossed content object, even when its centre is outside", () => {
    const elements = [
      text("title", [80, 60, 800, 40]),
      text("scope", [80, 104, 800, 24]),
      text("far", [80, 420, 300, 24]),
    ];
    // 圈住标题和副标题
    assert.deepEqual(annotationTargetsInBox(elements, [70, 50, 820, 90], SIZE), ["title", "scope"]);
    // 划过标题左端，即使标题中心在框外，也必须选中
    assert.deepEqual(annotationTargetsInBox(elements, [0, 60, 100, 40], SIZE), ["title"]);
    assert.deepEqual(annotationTargetsInBox(elements, [70, 50, 200, 90], SIZE), ["title", "scope"]);
    assert.equal(isAnnotationTarget(text("empty", [80, 60, 800, 40], { text: "  " }), SIZE), false);
    // 空框/点选不选中任何东西
    assert.deepEqual(annotationTargetsInBox(elements, [80, 400, 0, 0], SIZE), []);
  });
});
