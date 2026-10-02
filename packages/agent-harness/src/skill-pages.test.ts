import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEmptyProject,
  loadProject,
  type ChartElement,
} from "@open-slidestudio/pptd-v2";
import { createAgentBrain, loadPlaybook, runGenerateAsync } from "./index.js";
import { executeGenerateTool } from "./agent-tools.js";
import {
  applySkillDeck,
  parseBounds,
  parseSkillDeck,
  parseSkillPage,
  skillToCompose,
} from "./skill-pages.js";
import type { LlmChatMessage, LlmPort, LlmTurnResult } from "./llm-port.js";

describe("parseBounds MiniMax wrapper", () => {
  it("unwraps {item: string numbers}", () => {
    assert.deepEqual(parseBounds({ item: ["90", "120", "820", "100"] }), [90, 120, 820, 100]);
    assert.deepEqual(parseBounds({ item: { item: [0, 0, 960, 540] } }), [0, 0, 960, 540]);
  });
});

const skillLesson = {
  title: "勾股小课堂",
  pages: [
    {
      id: "page-01",
      pageType: "cover",
      elements: [
        {
          elementId: "title",
          elementType: "text",
          bounds: [80, 180, 800, 80],
          content: { text: "勾股小课堂", bold: true, fontSize: 32 },
        },
      ],
    },
    {
      id: "page-02",
      pageType: "content",
      elements: [
        {
          elementId: "title",
          elementType: "text",
          bounds: [40, 36, 880, 48],
          content: { text: "今天要搞懂什么", bold: true, fontSize: 22 },
        },
        {
          elementId: "path",
          elementType: "text",
          bounds: [40, 120, 880, 200],
          content: { text: "先认三条边。再记公式。最后用 3-4-5 检查。", fontSize: 16 },
        },
      ],
    },
    {
      id: "page-03",
      pageType: "content",
      elements: [
        {
          elementId: "title",
          elementType: "text",
          bounds: [40, 36, 880, 48],
          content: { text: "直角对着的边叫斜边", bold: true, fontSize: 22 },
        },
        {
          elementId: "triangle",
          elementType: "shape",
          bounds: [80, 140, 320, 240],
          shapeName: "rtTriangle",
          fill: { type: "solid", color: "#1F4E79" },
        },
        {
          elementId: "support",
          elementType: "text",
          bounds: [440, 160, 440, 200],
          content: { text: "先指直角，再认斜边。另外两边叫直角边。", fontSize: 16 },
        },
      ],
    },
    {
      id: "page-04",
      pageType: "content",
      elements: [
        {
          elementId: "title",
          elementType: "text",
          bounds: [40, 36, 880, 48],
          content: { text: "写成 a²+b²=c²，c 一定是斜边", bold: true, fontSize: 20 },
        },
        {
          elementId: "formula",
          elementType: "text",
          bounds: [80, 160, 800, 80],
          content: { text: "a² + b² = c²", bold: true, fontSize: 36 },
        },
      ],
    },
    {
      id: "page-05",
      pageType: "evidence",
      elements: [
        {
          elementId: "title",
          elementType: "text",
          bounds: [40, 36, 880, 48],
          content: { text: "课堂例子：3、4、5", bold: true, fontSize: 22 },
        },
        {
          elementId: "chart",
          elementType: "chart",
          bounds: [80, 140, 800, 280],
          data: {
            cols: ["边", "长度"],
            rows: [
              ["短直角边", 3],
              ["长直角边", 4],
              ["斜边", 5],
            ],
          },
          series: [{ type: "bar", name: "长度", encode: { x: "边", y: "长度" } }],
        },
      ],
    },
    {
      id: "page-06",
      pageType: "close",
      elements: [
        {
          elementId: "title",
          elementType: "text",
          bounds: [40, 36, 880, 48],
          content: { text: "今天带走什么", bold: true, fontSize: 22 },
        },
        {
          elementId: "take",
          elementType: "text",
          bounds: [40, 140, 880, 200],
          content: { text: "能指认三边。能写出公式。用 3-4-5 检查一次。", fontSize: 16 },
        },
      ],
    },
  ],
};

function call(name: string, args: unknown, id = name): LlmTurnResult {
  return {
    content: "",
    toolCalls: [
      {
        id,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}

function scriptedPort(turns: LlmTurnResult[]): LlmPort {
  let i = 0;
  return {
    async completeJson() {
      throw new Error("completeJson should not run when completeTurn exists");
    },
    async completeTurn(_messages: LlmChatMessage[]) {
      if (i >= turns.length) return { content: "done", toolCalls: [] };
      return turns[i++]!;
    },
  };
}

describe("skill PPTD pages", () => {
  it("parses official bounds tuples and object bounds", () => {
    assert.deepEqual(parseBounds([40, 36, 880, 48]), [40, 36, 880, 48]);
    assert.deepEqual(parseBounds({ left: 40, top: 36, width: 880, height: 48 }), [40, 36, 880, 48]);
    assert.equal(parseBounds([40, 36, 0, 48]), null);
  });

  it("unescapes JSON-style \\n so body copy is real line breaks", () => {
    const page = parseSkillPage(
      {
        id: "page-02",
        pageType: "content",
        elements: [
          {
            elementId: "body",
            elementType: "text",
            bounds: [40, 100, 880, 360],
            content: { text: "上午：浅草\\n· 雷门" },
          },
        ],
      },
      1,
    );
    assert.ok(page);
    const el = page.elements[0] as { content?: { text?: string } };
    assert.equal(el.content?.text?.includes("\\n"), false);
    assert.match(el.content?.text ?? "", /上午：浅草\n· 雷门/);
  });

  it("preserves an explicit layout role from write_page", () => {
    const page = parseSkillPage({
      id: "page-02",
      elements: [
        {
          elementId: "foot",
          elementType: "text",
          bounds: [40, 512, 880, 18],
          layoutRole: "footer",
          content: { text: "来源｜02", fontSize: 10 },
        },
      ],
    });
    assert.equal(page?.elements[0]?.layoutRole, "footer");
  });

  it("preserves an explicit exhibit role from write_page", () => {
    const page = parseSkillPage({
      id: "page-11",
      elements: [
        {
          elementId: "funnel-band",
          elementType: "shape",
          shapeName: "trapezoid",
          bounds: [120, 120, 600, 72],
          exhibitRole: "funnel",
        },
      ],
    });
    assert.equal(page?.elements[0]?.exhibitRole, "funnel");
  });

  it("preserves combination-chart series and secondary-axis metadata", () => {
    const page = parseSkillPage({
      id: "page-12",
      elements: [
        {
          elementId: "member-combo",
          elementType: "chart",
          bounds: [80, 120, 800, 300],
          data: {
            cols: ["月", "新增", "复购率"],
            rows: [["7月", 12.8, 26.4]],
          },
          series: [
            { type: "bar", encode: { x: "月", y: "新增" } },
            {
              type: "line",
              encode: { x: "月", y: "复购率" },
              axis: "secondary",
            },
          ],
          colors: ["#0064BC", "#00ACEE"],
          axis: { x: "月份", y: "新增会员（万）", secondaryY: "复购率（%）" },
        },
      ],
    });
    const chart = page?.elements[0] as ChartElement | undefined;
    assert.equal(chart?.elementType, "chart");
    if (chart?.elementType !== "chart") return;
    assert.equal(chart.series[1]?.axis, "secondary");
    assert.deepEqual(chart.colors, ["#0064BC", "#00ACEE"]);
    assert.equal(chart.axis?.secondaryY, "复购率（%）");
  });

  it("parses background.fill objects and textColor", () => {
    const page = parseSkillPage({
      id: "page-1",
      pageType: "cover",
      elements: [
        {
          type: "rect",
          left: 80,
          top: 80,
          width: 400,
          height: 280,
          background: { fill: "#D7EBCE" },
        },
        {
          type: "text",
          left: 80,
          top: 120,
          width: 800,
          height: 80,
          content: "种子怎么发芽？",
          textColor: "#44712E",
          fontSize: 56,
        },
      ],
    });
    assert.ok(page);
    const panel = page?.elements.find((el) => el.elementType === "shape") as
      | { fill?: { color?: string } }
      | undefined;
    const title = page?.elements.find((el) => el.elementType === "text") as
      | { content?: { text?: string; color?: string } }
      | undefined;
    assert.equal(panel?.fill?.color, "#D7EBCE");
    assert.equal(title?.content?.text, "种子怎么发芽？");
    assert.equal(title?.content?.color, "#44712E");
  });

  it("parses left/top/width/height and background as a shape fill", () => {
    const page = parseSkillPage({
      id: "page-1",
      pageType: "cover",
      elements: [
        {
          type: "rect",
          left: 100,
          top: 100,
          width: 760,
          height: 340,
          background: "#D7EBCE",
        },
        {
          type: "text",
          left: 200,
          top: 128,
          width: 400,
          height: 48,
          text: "种子是怎么发芽的？",
          color: "#44712E",
          fontSize: 42,
        },
      ],
    });
    assert.ok(page);
    const panel = page?.elements.find((el) => el.elementType === "shape") as
      | { fill?: { color?: string }; bounds: number[] }
      | undefined;
    assert.deepEqual(panel?.bounds, [100, 100, 760, 340]);
    assert.equal(panel?.fill?.color, "#D7EBCE");
  });

  it("accepts a write_page with title/body and no elements[]", () => {
    const page = parseSkillPage({
      id: "page-02",
      pageType: "content",
      title: "水把种子叫醒",
      body: "种子先喝水，外壳变软，小根才能钻出来。",
    });
    assert.ok(page);
    assert.equal(page?.id, "page-02");
    assert.equal(page?.elements.length, 2);
    const texts = page?.elements.map((el) =>
      el.elementType === "text" ? (el as { content: { text: string } }).content.text : "",
    );
    assert.deepEqual(texts, ["水把种子叫醒", "种子先喝水，外壳变软，小根才能钻出来。"]);
  });

  it("accepts official header/list/circle/band vocab from write_page", () => {
    const cover = parseSkillPage({
      id: "page-1",
      pageType: "cover",
      elements: [
        { type: "header", content: "种子怎么发芽", tag: "二年级", size: "hero", color: "#44712E" },
        { type: "circle", size: "giant", background: "#F9DED8" },
        { type: "band", size: "medium", background: "#D7EBCE" },
      ],
    });
    assert.ok(cover);
    assert.ok(cover?.elements.some((el) => el.elementId === "title"));
    assert.ok(cover?.elements.some((el) => el.elementId === "circle"));
    assert.ok(cover?.elements.some((el) => el.elementId === "title-band"));
    const route = parseSkillPage({
      id: "page-2",
      pageType: "route",
      elements: [
        { type: "header", title: "一粒种子要走过哪几步", bounds: { left: 80, top: 60, width: 800, height: 100 } },
        {
          type: "list",
          items: ["先喝饱水", "种皮裂开", "小根钻出来", "芽顶出土"],
          bounds: { left: 80, top: 180, width: 800, height: 300 },
        },
      ],
    });
    assert.ok(route);
    assert.ok(route?.elements.some((el) => el.elementId === "panel-0"));
    assert.ok(route?.elements.some((el) => el.elementId === "well-0"));
    assert.match(JSON.stringify(route?.elements), /先喝饱水/);
    const ruled = parseSkillPage({
      id: "page-2",
      pageType: "route",
      elements: [
        { type: "header", title: "发芽要什么条件", bounds: { left: 80, top: 60, width: 800, height: 80 } },
        { type: "rule", color: "#F5987E", bounds: { left: 80, top: 150, width: 72, height: 6 } },
        { type: "list", items: ["要喝水", "要呼吸", "要暖一暖"] },
      ],
    });
    assert.ok(ruled?.elements.some((el) => el.elementId === "rule"));
    const firstOfficial = parseSkillPage({
      id: "page-1",
      pageType: "cover",
      elements: [
        {
          type: "header",
          size: "hero",
          content: "🌱 种子是怎么发芽的",
          tag: "二年级科学自然课",
          color: "#44712E",
        },
        { type: "text", size: "body", content: "让我们一起探究小小的种子是如何破土而出，长成绿油油的小苗的！" },
        { type: "circle", size: "giant", background: "#F9DED8" },
        { type: "band", size: "medium", background: "#D7EBCE" },
      ],
    });
    assert.ok(firstOfficial);
    assert.ok(firstOfficial?.elements.some((el) => el.elementId === "title"));
    assert.ok(firstOfficial?.elements.some((el) => el.elementId === "circle"));
    assert.ok(firstOfficial?.elements.some((el) => el.elementId === "title-band"));
    const rgbCover = parseSkillPage({
      id: "page-1",
      pageType: "cover",
      elements: [
        { type: "circle", bounds: [60, 80, 400, 400], color: [249, 222, 216] },
        { type: "band", bounds: [36, 348, 560, 156], color: [215, 235, 206] },
        { type: "header", text: "种子怎么发芽" },
      ],
    });
    assert.ok(rgbCover);
    const blush = rgbCover?.elements.find((el) => el.elementId === "circle") as
      | { fill?: { color?: string } }
      | undefined;
    assert.equal(blush?.fill?.color?.toUpperCase(), "#F9DED8");
    const concept = parseSkillPage({
      id: "page-3",
      pageType: "concept",
      elements: [
        { type: "header", text: "种子里面有什么：小小的生命大世界" },
        {
          type: "concept",
          columns: [
            {
              title: "外部与营养",
              items: [
                { title: "种皮（保护伞）", desc: "坚硬的外衣，保护里面柔嫩的生命。" },
                { title: "子叶（营养库）", desc: "肥厚的部分，存贮发芽所需的营养。" },
              ],
            },
          ],
        },
      ],
    });
    assert.equal(concept?.elements.some((el) => el.elementId === "panel-0"), false);
    assert.ok(concept?.elements.some((el) => el.elementId === "lead"));
    assert.match(JSON.stringify(concept?.elements), /种皮（保护伞）/);
    assert.match(JSON.stringify(concept?.elements), /坚硬的外衣/);
    const result = parseSkillPage({
      id: "page-5",
      pageType: "demo",
      elements: [
        { type: "header", text: "种子发芽的奇妙过程：从破土到长成幼苗" },
        {
          type: "result",
          steps: [
            { title: "吸水膨胀", desc: "干种子吸水后肚子变大。" },
            { title: "胚根向下", desc: "胚根先钻出来。" },
          ],
        },
      ],
    });
    assert.equal(result?.elements.some((el) => el.elementId === "panel-0"), false);
    assert.match(JSON.stringify(result?.elements), /吸水膨胀/);
    const placed = parseSkillPage({
      id: "page-1",
      pageType: "cover",
      elements: [
        { type: "circle", x: 550, y: 100, size: 200 },
        { type: "header", text: "二年级科学趣味课堂" },
        { type: "title", text: "种子怎么发芽" },
        { type: "band", text: "看一粒种子怎样醒来" },
      ],
    });
    const circle = placed?.elements.find((el) => el.elementId === "circle") as
      | { bounds?: number[] }
      | undefined;
    assert.deepEqual(circle?.bounds, [-70, -30, 430, 430]);
    const chip = placed?.elements.find((el) => el.elementId === "chip") as
      | { content?: { text?: string }; bounds?: number[] }
      | undefined;
    const titleEl = placed?.elements.find((el) => el.elementId === "title") as
      | { bounds?: number[] }
      | undefined;
    assert.equal(chip?.content?.text, "二年级");
    assert.ok((chip?.bounds?.[1] ?? 0) >= 348);
    assert.ok((titleEl?.bounds?.[1] ?? 0) >= 348);
    assert.equal(
      placed?.elements.filter((el) => el.elementType === "shape" && (el as { shapeName?: string }).shapeName === "ellipse")
        .length,
      1,
    );
    assert.ok(placed?.elements.some((el) => el.elementId === "title-band"));
    assert.match(JSON.stringify(placed?.elements), /看一粒种子怎样醒来/);
    assert.doesNotMatch(JSON.stringify(placed?.elements), /二年级科学趣味课堂/);
  });

  it("parses style fill/left percent canvas shorthand onto PPTD bounds", () => {
    const page = parseSkillPage({
      id: "page-1",
      pageType: "cover",
      elements: [
        {
          type: "shape",
          shape: "ellipse",
          style: { fill: "#F9DED8", left: "-8%", top: "-18%", width: "52%", height: "92%" },
        },
        {
          type: "text",
          content: "种子怎么发芽",
          style: { left: 80, top: 478, width: 480, height: 56, fontSize: 44, color: "#44712E", fontWeight: "700" },
        },
      ],
    });
    assert.ok(page);
    const circle = page?.elements.find((el) => el.elementType === "shape") as
      | { bounds?: number[]; fill?: { color?: string }; shapeName?: string }
      | undefined;
    assert.equal(circle?.shapeName, "ellipse");
    assert.equal(circle?.fill?.color?.toUpperCase(), "#F9DED8");
    assert.ok(circle?.bounds);
    assert.ok(Math.abs((circle?.bounds?.[0] ?? 0) - -0.08 * 960) < 1);
    const title = page?.elements.find((el) => el.elementType === "text") as
      | { content?: { text?: string; color?: string; bold?: boolean } }
      | undefined;
    assert.equal(title?.content?.text, "种子怎么发芽");
    assert.equal(title?.content?.color?.toUpperCase(), "#44712E");
    assert.equal(title?.content?.bold, true);
  });

  it("preserves sibling text style on canonical elementType payloads", () => {
    const page = parseSkillPage({
      id: "1_cover",
      pageType: "cover",
      elements: [
        {
          elementId: "cover_title",
          elementType: "text",
          bounds: [72, 80, 816, 52],
          content: { text: "資本支出收到 600–640 億，是產能不夠。" },
          style: {
            color: "#F4ECDD",
            fontSize: 40,
            fontFamily: { latin: "Unna", ea: "Noto Serif CJK TC" },
            bold: false,
            italic: true,
            underline: false,
            backgroundColor: "#0E2A47",
            lineHeight: 1.18,
            letterSpacing: 0.5,
            align: "[\"right\",\"middle\"]",
            wrap: false,
            list: "bullet",
            href: "https://example.test/source",
          },
        },
      ],
    });
    const title = page?.elements[0];
    assert.equal(title?.elementType, "text");
    if (title?.elementType !== "text") assert.fail("text element was not parsed");
    assert.deepEqual(title.content, {
      text: "資本支出收到 600–640 億，是產能不夠。",
      wrap: false,
      bold: false,
      italic: true,
      underline: false,
      fontSize: 40,
      color: "#F4ECDD",
      fontFamily: { latin: "Unna", ea: "Noto Serif CJK TC" },
      backgroundColor: "#0E2A47",
      lineHeight: 1.18,
      letterSpacing: 0.5,
      align: ["right", "middle"],
      list: "bullet",
      href: "https://example.test/source",
    });
  });

  it("preserves finite numeric text from canonical elementType payloads", () => {
    const page = parseSkillPage({
      id: "10_risk",
      elements: [
        {
          elementId: "p10_r1_num",
          elementType: "text",
          bounds: [72, 158, 28, 28],
          content: { text: 1 },
          style: {
            color: "#A95228",
            fontSize: 22,
            fontFamily: { latin: "Unna", ea: "Noto Serif CJK TC" },
          },
        },
      ],
    });
    assert.ok(page);
    const number = page.elements[0] as
      | { elementType?: string; content?: { text?: string; color?: string; fontSize?: number } }
      | undefined;
    assert.equal(number?.elementType, "text");
    assert.equal(number?.content?.text, "1");
    assert.equal(number?.content?.color, "#A95228");
    assert.equal(number?.content?.fontSize, 22);
  });

  it("parses official recipe atoms Grok wrote for 种子怎么发芽", () => {
    const cover = parseSkillPage({
      id: "cover",
      elements: [
        { type: "cover-botanical" },
        { type: "title-band", title: "种子怎么发芽", subtitle: "从休眠到幼苗 · 结构 · 条件 · 过程" },
      ],
    });
    assert.ok(cover);
    assert.equal(cover?.pageType, "cover");
    assert.ok(cover?.elements.some((el) => el.elementId === "circle"));
    assert.ok(cover?.elements.some((el) => el.elementId === "title-band"));
    assert.ok(cover?.elements.some((el) => el.elementId === "chip"));
    const route = parseSkillPage({
      id: "route",
      elements: [
        { type: "coral-rule" },
        { type: "chapter", text: "01 路径" },
        { type: "page-title", text: "四站学习路径：先看结构，再抓条件，再跟过程" },
        {
          type: "route-path",
          stations: [
            { name: "结构", note: "种皮·胚·胚乳" },
            { name: "条件", note: "水·空气·温度" },
            { name: "过程", note: "吸胀到出土" },
            { name: "迁移", note: "实验与误区" },
          ],
        },
        { type: "footer-chrome", left: "« »", right: "路径｜02" },
      ],
    });
    assert.ok(route);
    assert.ok(route?.elements.some((el) => el.elementId === "path-spine"));
    assert.ok(route?.elements.some((el) => el.elementId === "step-0"));
    const method = parseSkillPage({
      id: "method",
      elements: [
        { type: "coral-rule" },
        { type: "chapter", text: "03 条件" },
        { type: "page-title", text: "萌发三要素：适量水分、充足空气、适宜温度缺一不可" },
        {
          type: "method-panels",
          panels: [
            { title: "水分", body: "吸胀软化种皮" },
            { title: "空气（氧）", body: "呼吸供能" },
            { title: "适宜温度", body: "酶活性窗口" },
          ],
        },
        { type: "footer-chrome", left: "« »", right: "条件｜04" },
      ],
    });
    assert.ok(method);
    assert.ok(method?.elements.some((el) => el.elementId === "panel-0"));
    assert.ok(method?.elements.some((el) => el.elementId === "well-0"));
    const demo = parseSkillPage({
      id: "demo",
      elements: [
        { type: "demo-band", title: "阶段证据：从吸胀到出土的可观察链条" },
        {
          type: "two-column-body",
          left: { heading: "时间顺序", bullets: ["吸胀", "胚根先出"] },
          right: { heading: "课堂可检核", bullets: ["称重法"] },
        },
        { type: "result-bar", text: "结论：先根后芽" },
        { type: "footer-chrome", left: "« »", right: "过程｜05" },
      ],
    });
    assert.ok(demo);
    assert.ok(demo?.elements.some((el) => el.elementId === "pink-band"));
    assert.ok(demo?.elements.some((el) => el.elementId === "result-bar"));
    const transfer = parseSkillPage({
      id: "transfer",
      elements: [
        { type: "result-bar", text: "带走三句话：胚是关键" },
        { type: "next-action", title: "下一步行动", items: ["用绿豆做对照"] },
        { type: "footer-chrome", left: "« »", right: "迁移｜06" },
      ],
    });
    assert.ok(transfer);
    assert.ok(transfer?.elements.some((el) => el.elementId === "result-bar"));
    assert.ok(transfer?.elements.some((el) => el.elementId === "panel-rule"));
  });

  it("parses official playbook box + position vocab and keeps copy", () => {
    const page = parseSkillPage({
      id: "page-1",
      pageType: "cover",
      notes: "Cover page for Grade 2 seed germination courseware.",
      elements: [
        { type: "slide", background: { fill: "#FDFAF5" } },
        {
          type: "text",
          text: "种子怎么发芽？",
          fontSize: 52,
          fontWeight: 700,
          color: "#44712E",
          align: "center",
          position: { x: 50, y: 80, w: 900, h: 100 },
        },
        {
          type: "box",
          position: { x: 70, y: 260, w: 860, h: 180 },
          background: { fill: "#D7EBCE" },
        },
        {
          type: "text",
          text: "今天，我们一起开启奇妙的种子发芽之旅！",
          fontSize: 20,
          fontWeight: 600,
          color: "#F5987E",
          position: { x: 100, y: 370, w: 800, h: 50 },
        },
      ],
    });
    assert.ok(page);
    assert.equal(page?.background?.type, "solid");
    assert.equal(
      page?.background && "color" in page.background ? page.background.color : "",
      "#FDFAF5",
    );
    const box = page?.elements.find((el) => el.elementType === "shape") as
      | { bounds: number[]; fill?: { color?: string }; shapeName?: string }
      | undefined;
    assert.deepEqual(box?.bounds, [70, 260, 860, 180]);
    assert.equal(box?.fill?.color, "#D7EBCE");
    assert.equal(box?.shapeName, "roundRect");
    const title = page?.elements.find((el) => el.elementType === "text") as
      | { content?: { text?: string; bold?: boolean } }
      | undefined;
    assert.equal(title?.content?.text, "种子怎么发芽？");
    assert.equal(title?.content?.bold, true);
  });

  it("parses OpenKimi canvas shorthand into PPTD elements", () => {
    const parsed = parseSkillDeck({
      pages: [
        {
          elements: [
            { type: "rect", x: 0, y: 0, w: 960, h: 540, fill: "#F8F9FA" },
            {
              type: "text",
              x: 120,
              y: 140,
              w: 720,
              h: 80,
              text: "神奇的直角三角形魔术",
              fontSize: 44,
              fontWeight: "bold",
              fill: "#1E293B",
              align: "center",
            },
          ],
        },
        {
          elements: [
            {
              type: "text",
              x: 60,
              y: 45,
              w: 840,
              h: 40,
              text: "什么是直角三角形？",
              fontSize: 32,
              fontWeight: "bold",
              fill: "#1E293B",
            },
          ],
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed.title, "神奇的直角三角形魔术");
    assert.equal(parsed.pages.length, 2);
    assert.equal(parsed.pages[0]?.background, undefined);
    const bleed = parsed.pages[0]?.elements.find((el) => el.elementType === "shape") as
      | { bounds?: number[]; fill?: { color?: string } }
      | undefined;
    assert.deepEqual(bleed?.bounds, [0, 0, 960, 540]);
    assert.equal(bleed?.fill?.color, "#F8F9FA");
    const title = parsed.pages[0]?.elements.find((el) => el.elementType === "text") as
      | { content?: { text?: string; bold?: boolean; fontSize?: number } }
      | undefined;
    assert.equal(title?.content?.text, "神奇的直角三角形魔术");
    assert.equal(title?.content?.bold, true);
    assert.equal(title?.content?.fontSize, 44);
  });

  it("splits a flat canvas elements[] on slide-N ids", () => {
    const parsed = parseSkillDeck({
      width: 960,
      height: 540,
      elements: [
        {
          id: "slide-1-bg",
          type: "rect",
          x: 0,
          y: 0,
          width: 960,
          height: 540,
          fill: "#F8F9FA",
        },
        {
          id: "slide-1-title",
          type: "text",
          x: 80,
          y: 160,
          width: 800,
          height: 80,
          text: "植物是怎么吃饭的",
          fontSize: 34,
          fontWeight: "bold",
          fill: "#1E293B",
        },
        {
          id: "slide-2-header",
          type: "text",
          x: 60,
          y: 40,
          width: 800,
          height: 40,
          text: "第一关",
          fontSize: 28,
          fontWeight: "bold",
          fill: "#1E293B",
        },
        {
          id: "slide-6-footer",
          type: "text",
          x: 80,
          y: 400,
          width: 800,
          height: 30,
          text: "下课啦",
          fontSize: 14,
          fill: "#64748B",
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed.pages.length, 3);
    assert.equal(parsed.title, "植物是怎么吃饭的");
    assert.equal(parsed.pages[0]?.elements.some((el) => el.elementId === "slide-1-title"), true);
    assert.equal(parsed.pages[2]?.id, "page-06");
  });

  it("applySkillDeck writes the model elements, not a card stamp", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-pages-"));
    const project = createEmptyProject(dir, { title: "t" });
    const parsed = parseSkillDeck(skillLesson);
    assert.ok(parsed);
    assert.equal(parsed.pages.length, 6);
    applySkillDeck(project, parsed, loadPlaybook().palette);
    const concept = project.pages.find((pg) => pg.page.elements.some((e) => e.elementId === "triangle"));
    assert.ok(concept);
    assert.ok(concept.page.elements.some((e) => e.elementType === "shape"));
    assert.equal(
      concept.page.elements.some((e) => /^cbg\d+$/.test(e.elementId)),
      false,
    );
    const evidence = project.pages.find((pg) => pg.page.elements.some((e) => e.elementType === "chart"));
    assert.ok(evidence);
    assert.ok(fs.existsSync(path.join(dir, "_agent", "skill-deck.json")));
    const plan = skillToCompose(parsed);
    assert.equal(plan.title, "勾股小课堂");
    assert.equal(plan.pages[2]?.title, "直角对着的边叫斜边");
  });

  it("compose_deck with elements is marked PPTD, not IR fallback", () => {
    const playbook = loadPlaybook({ categoryId: "education-training" });
    const exec = executeGenerateTool("compose_deck", skillLesson, {
      brief: "介绍一下勾股定理，面向小学生",
      playbook,
      todos: [],
      researchNotes: [],
    });
    assert.equal(exec.ok, true);
    assert.match(exec.summary, /PPTD/);
    assert.doesNotMatch(exec.summary, /IR fallback/);
  });

  it("agent brain persists skill elements onto disk", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-run-"));
    const brain = createAgentBrain({
      categoryId: "education-training",
      llm: scriptedPort([
        call("think", { summary: "小学生", detail: "课堂路径，写 PPTD。" }, "t1"),
        call("read_playbook", { section: "pptd" }, "r1"),
        call("write_todo", {
          items: [
            { title: "封面", note: "课题" },
            { title: "路径", note: "今天要搞懂什么" },
            { title: "概念", note: "斜边" },
            { title: "公式", note: "a2+b2=c2" },
            { title: "例子", note: "3-4-5" },
            { title: "带走", note: "复述" },
          ],
        }, "w1"),
        call("compose_deck", skillLesson, "c1"),
      ]),
    });
    const result = await runGenerateAsync({
      projectRoot: dir,
      brief: "介绍一下勾股定理，面向小学生",
      brain,
    });
    assert.equal(result.status, "ready");
    assert.equal(result.composeSource, "agent");
    const project = loadProject(dir);
    assert.equal(project.presentation.title, "勾股小课堂");
    assert.ok(project.pages.some((pg) => pg.page.elements.some((e) => e.elementId === "triangle")));
    assert.ok(project.pages.some((pg) => pg.page.elements.some((e) => e.elementType === "chart")));
    assert.equal(
      project.pages.some((pg) => pg.page.elements.some((e) => /^cbg\d+$/.test(e.elementId))),
      false,
    );
  });
});
