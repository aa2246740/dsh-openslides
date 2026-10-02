import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { finishScriptedPages } from "./pi-brain.js";
import { parsePagedScript } from "./host-produce.js";

const pal = {
  background: "#F7F4EE",
  text: "#333333",
  muted: "#7E7E7E",
  primary: "#1F4E3D",
  accent: "#C45C26",
  danger: "#B42318",
};

describe("Pi host-finish helper (not product generate)", () => {
  it("can paint remaining script pages — product produce must not call this after agent_end", () => {
    const brief = [
      "月报。",
      "【第1页 封面：澄光生活】",
      "结论：封面不放经营数字。",
      "【第2页 核心KPI仪表盘】",
      "结论：营收 12,860 万。",
      "卡片：营业收入 12,860 万｜净利率 7.9%",
      "【第3页 利润表摘要】",
      "结论：净利润 1,016 万。",
      "版式：四列表。",
      "列：本月 / 上月",
      "营业收入 12,860 / 12,110",
      "净利润 1,016 / 966",
    ].join("\n");
    const scripted = parsePagedScript(brief);
    assert.equal(scripted.length, 3);
    const partial = {
      title: "澄光生活",
      pages: [
        {
          id: "page-1",
          pageType: "cover",
          elements: [
            {
              elementId: "title",
              elementType: "text" as const,
              bounds: [40, 40, 400, 40] as [number, number, number, number],
              content: { text: "澄光生活", fontSize: 28 },
            },
          ],
        },
      ],
    };
    const finished = finishScriptedPages(partial, brief, pal);
    assert.equal(finished.added, 2);
    assert.equal(finished.deck.pages.length, 3);
    const blob = JSON.stringify(finished.deck.pages);
    assert.match(blob, /12,860/);
    assert.match(blob, /1,016|7\.9/);
  });
});
