import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyExhibit,
  extractKpis,
  extractTable,
  paintExhibit,
  type HostPageCopy,
} from "./exhibit-paint.js";

const pal = {
  background: "#F7F4EE",
  text: "#333333",
  muted: "#7E7E7E",
  primary: "#1F4E3D",
  accent: "#C45C26",
  danger: "#B42318",
};

const kpi: HostPageCopy = {
  id: "page-03",
  pageType: "content",
  title: "核心KPI仪表盘",
  kicker: "7月营收1.286亿，同比+18.4%，净利率7.9%",
  lines: [
    "营业收入 1.286 亿｜同比 +18.4%",
    "毛利率 37.8%｜环比 +0.3pct",
    "净利润 1,016 万｜净利率 7.9%",
    "GMV 1.62 亿｜核销率 79.4%",
    "门店 186 家｜净增 +3",
    "客单价 58.6 元｜30日复购 26.4%",
  ],
  body: `结论：7月营收1.286亿，同比+18.4%，净利率7.9%。
版式：2×3 大卡片
卡片：
1. 营业收入 1.286 亿｜同比 +18.4%↑
2. 毛利率 37.8%｜环比 +0.3pct↑
3. 净利润 1,016 万｜净利率 7.9%
4. GMV 1.62 亿｜核销率 79.4%
5. 门店 186 家｜净增 +3
6. 客单价 58.6 元
锁定 12,860 万。`,
};

const tablePage: HostPageCopy = {
  id: "page-09",
  pageType: "content",
  title: "利润表摘要",
  kicker: "净利润 1,016 万，净利率 7.9%",
  lines: ["营业收入 12,860 / 12,110 / 10,861 / 12,200"],
  body: `结论：净利润 1,016 万，净利率 7.9%。
版式：主体四列表
列：本月 / 上月 / 去年同期 / 本月预算。
营业收入 12,860 / 12,110 / 10,861 / 12,200
营业成本 7,999 / 7,569 / 6,886 / 7,564
毛利 4,861 / 4,541 / 3,975 / 4,636
净利润 1,016 / 966 / 714 / 1,020`,
};

const chartPage: HostPageCopy = {
  id: "page-05",
  pageType: "content",
  title: "收入拆解",
  kicker: "茶饮主力",
  lines: ["茶饮 62%（7,973 万）"],
  body: `版式：三图并排。
- 环形-产品：茶饮 62%（7,973 万）/ 轻食 21%（2,701 万）/ 周边 12%（1,543 万）/ 其他 5%（643 万）`,
};

describe("exhibit painters", () => {
  it("classifies KPI / table / chart", () => {
    assert.equal(classifyExhibit(kpi, 2, 20), "kpi");
    assert.equal(classifyExhibit(tablePage, 8, 20), "table");
    assert.equal(classifyExhibit(chartPage, 4, 20), "chart");
  });

  it("paints six KPI cards and keeps 1,016 / 37.8", () => {
    const cards = extractKpis(kpi);
    assert.ok(cards.length >= 4);
    const page = paintExhibit(kpi, pal, 2, [kpi]);
    const values = page.elements
      .filter((e) => e.elementType === "text")
      .map((e) => (e as { content?: { text?: string } }).content?.text || "")
      .join(" ");
    assert.match(values, /1,016|1\.286|37\.8/);
    assert.ok(page.elements.filter((e) => e.elementType === "shape").length >= 4);
    assert.doesNotMatch(values, /种子怎么发芽/);
  });

  it("paints a real table with 12,860", () => {
    const parsed = extractTable(tablePage);
    assert.ok(parsed);
    assert.ok(parsed!.rows.some((r) => r.join(" ").includes("12,860")));
    const page = paintExhibit(tablePage, pal, 8, [tablePage]);
    const table = page.elements.find((e) => e.elementType === "table");
    assert.ok(table);
    const blob = JSON.stringify(table);
    assert.match(blob, /12,860/);
  });

  it("paints a real chart", () => {
    const page = paintExhibit(chartPage, pal, 4, [chartPage]);
    assert.ok(page.elements.some((e) => e.elementType === "chart"));
  });

  it("splits 亮点/预警 and 卡片 pipes", () => {
    const two: HostPageCopy = {
      id: "p4",
      pageType: "content",
      title: "经营亮点与预警",
      lines: [],
      body: `版式：左右两栏。左「亮点」绿底3条，右「预警」红/黄3条。
亮点：①夏季爆品「青柑冰萃」单品 1,186 万；②华东同店 +7.2%。
预警：①华北同店 -2.1%；②原料茶叶成本 +8.6%。`,
    };
    assert.equal(classifyExhibit(two, 3, 20), "two-col");
    const page = paintExhibit(two, pal, 3, [two]);
    const blob = page.elements
      .filter((e) => e.elementType === "text")
      .map((e) => (e as { content?: { text?: string } }).content?.text || "")
      .join("\n");
    assert.match(blob, /青柑冰萃/);
    assert.match(blob, /华北同店/);
    assert.doesNotMatch(blob, /红\/黄3条/);

    const member: HostPageCopy = {
      id: "p12",
      pageType: "content",
      title: "客户与会员",
      lines: [],
      body: "版式：上6卡片。\n卡片：会员总量 286 万｜月活 62.4 万｜新增 12.8 万｜30日复购 26.4%｜90日复购 41.8%｜NPS 54。",
    };
    assert.equal(classifyExhibit(member, 11, 20), "kpi");
    const kpis = extractKpis(member);
    assert.ok(kpis.length >= 4);
    assert.ok(kpis.some((c) => /286/.test(c.value) || /会员/.test(c.label)));
  });
});
