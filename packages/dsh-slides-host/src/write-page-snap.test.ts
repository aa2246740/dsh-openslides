import assert from "node:assert/strict";
import test from "node:test";
import { packColorWriteContextFrom } from "@open-slidestudio/presentation-run";
import { decideWritePage } from "./write-page.js";

test("first write refuses off-pack colors with the allowed palette instead of snapping them", () => {
  const pack = packColorWriteContextFrom({
    designSystemId: "finance/honey-orange-memo",
  });
  assert.ok(pack.adoptedPackHexes && pack.adoptedPackHexes.size > 0);
  const page = {
    id: "cover",
    pageType: "cover",
    background: { type: "solid", color: "#F3D4C2" },
    elements: [
      {
        elementId: "title",
        elementType: "text",
        bounds: [48, 48, 720, 72],
        content: { text: "全行宣讲", fontSize: 28, color: "#172856" },
      },
    ],
  };
  const before = JSON.stringify(page);
  const decision = decideWritePage(page, undefined, { pageCount: 0, ...pack });
  if (decision.action !== "reject" || decision.outcome.outcome !== "rejected") {
    throw new Error(`expected pack_color reject, got ${JSON.stringify(decision)}`);
  }
  const detail = decision.outcome.detail;
  assert.match(detail, /pack_color/);
  assert.match(detail, /Allowed pack colors:/);
  for (const hex of [...pack.adoptedPackHexes!].slice(0, 3)) {
    assert.match(detail, new RegExp(hex));
  }
  assert.equal(JSON.stringify(page), before);
});
