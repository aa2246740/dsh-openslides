import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEmptyProject, loadProject } from "@open-slidestudio/pptd-v2";
import { extractPlaces, outlineFromBrief, parsePagedScript, createHostBrain } from "./host-produce.js";
import { classifyExhibit } from "./exhibit-paint.js";
import { parsePagedScript as parsePagedScriptFromIndex, runGenerateAsync } from "./index.js";
import type { LlmPort } from "./llm-port.js";
import type { PageRasterPort } from "./page-raster.js";
import type { ToolStep } from "./harness-types.js";

function twentyPageScript(): string {
  const blocks: string[] = [];
  for (let n = 1; n <= 20; n++) {
    const heading =
      n === 1 ? "封面：澄光生活7月经营月报" : n === 20 ? "附录与口径" : n === 2 ? "核心KPI仪表盘" : `主题${n}`;
    const extra =
      n === 2
        ? "版式：2×3 大卡片。\n卡片：\n1. 营业收入 1.286 亿｜同比 +18.4%\n2. 毛利率 37.8%\n3. 净利润 1,016 万\n锁定 12,860 万。"
        : "本页保留脚本正文，不交给模型压缩。数字 1.286 仅作示例。";
    blocks.push(`【第${n}页 ${heading}】\n结论：第${n}页结论写清楚。\n${extra}`);
  }
  return blocks.join("\n\n");
}

describe("host produce", () => {
  it("pulls 浅草 涩谷 台场 out of a Tokyo brief", () => {
    const places = extractPlaces("东京3日游攻略：浅草、涩谷、台场，10月去");
    assert.deepEqual(places, ["浅草", "涩谷", "台场"]);
  });

  it("outlines travel as cover + one page per place + close", () => {
    const pages = outlineFromBrief("东京3日游攻略：浅草、涩谷、台场，10月去");
    const titles = pages.map((p) => p.title).join(" ");
    assert.match(titles, /浅草/);
    assert.match(titles, /涩谷/);
    assert.match(titles, /台场/);
    assert.doesNotMatch(titles, /种子/);
    assert.ok(pages.length >= 5);
  });

  it("turns a 第N页 script into one host page per block", () => {
    const brief = [
      "生成月报。",
      "【第1页 封面：澄光生活7月经营月报】",
      "结论：封面不放经营数字。",
      "【第2页 核心KPI】",
      "结论：7月营收1.286亿。",
      "营收 12,860 万，净利率 7.9%。",
      "【第3页 附录】",
      "本报告数据均为虚构，仅用于演示。",
    ].join("\n");
    const pages = parsePagedScript(brief);
    assert.equal(pages.length, 3);
    assert.match(pages[0]!.title, /澄光生活/);
    assert.match(pages[1]!.lines.join(" "), /12,860/);
    assert.ok(pages[1]!.body);
    assert.match(pages[1]!.body!, /12,860/);
    assert.equal(pages[0]!.exhibit, "cover");
    assert.equal(pages[1]!.exhibit, "kpi");
    assert.equal(pages[2]!.exhibit, "close");
    assert.equal(outlineFromBrief(brief).length, 3);
    assert.equal(parsePagedScriptFromIndex(brief).length, 3);
  });

  it("turns 20 【第N页】 blocks into 20 host pages with body + exhibit", () => {
    const brief = twentyPageScript();
    const pages = parsePagedScript(brief);
    assert.equal(pages.length, 20);
    assert.ok(pages.every((p) => Boolean(p.body && p.body.length > 10)));
    assert.ok(pages.every((p) => Boolean(p.exhibit)));
    assert.equal(pages[0]!.exhibit, "cover");
    assert.equal(pages[1]!.exhibit, "kpi");
    assert.equal(pages[19]!.exhibit, "close");
    assert.match(pages[1]!.body || "", /12,860|1\.286/);
    assert.equal(outlineFromBrief(brief).length, 20);
    assert.equal(outlineFromBrief("按附件做月报", brief).length, 20);
  });

  it("parses the Chengguang 20-page monthly-report script", () => {
    const file = path.join(
      process.cwd(),
      "output/hub-1787120904154-下面是一份可直接复制使用的完整提示词-/_agent/brief.txt",
    );
    if (!fs.existsSync(file)) return;
    const pages = parsePagedScript(fs.readFileSync(file, "utf8"));
    assert.equal(pages.length, 20);
    assert.match(pages[0]!.title, /澄光|封面|经营月报/);
    assert.match(pages[2]!.lines.join(" ") + pages[2]!.kicker, /12,860|1\.286|营收/);
    assert.match(pages[19]!.title, /附录|口径/);
  });

  it("writes a travel deck without waiting on a tool loop", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "host-produce-"));
    createEmptyProject(dir, { title: "生成中" });
    const brain = createHostBrain({
      designSystemId: "promotion/travel-green-handbook",
    });
    const result = await runGenerateAsync({
      projectRoot: dir,
      brief: "东京3日游攻略：浅草、涩谷、台场，10月去",
      brain,
      exportPptx: false,
    });
    assert.equal(result.status, "ready");
    const project = loadProject(dir);
    assert.ok(project.pages.length >= 5);
    const blob = project.pages
      .map((p) =>
        p.page.elements
          .map((e) => {
            if (e.elementType !== "text") return "";
            const c = e.content;
            return c && typeof c === "object" && "text" in c ? String(c.text || "") : "";
          })
          .join(" "),
      )
      .join("\n");
    assert.match(blob, /浅草/);
    assert.match(blob, /涩谷/);
    assert.doesNotMatch(blob, /种子怎么发芽/);
  });

  it("paints Chengguang KPI / table / chart as PPTD objects", async () => {
    const brief = [
      "澄光月报。全部数据均为虚构。",
      "【第1页 封面：澄光生活7月经营月报】",
      "结论：封面不放经营数字。",
      "版式：海军深蓝。",
      "【第2页 核心KPI仪表盘】",
      "结论：7月营收1.286亿，净利率7.9%。",
      "版式：2×3 大卡片。",
      "卡片：",
      "1. 营业收入 1.286 亿｜同比 +18.4%",
      "2. 毛利率 37.8%",
      "3. 净利润 1,016 万",
      "锁定 12,860 万。",
      "【第3页 收入拆解】",
      "结论：茶饮主力。",
      "版式：三图并排。",
      "- 环形-产品：茶饮 62%（7,973 万）/ 轻食 21%（2,701 万）/ 周边 12%（1,543 万）",
      "【第4页 利润表摘要】",
      "结论：净利润 1,016 万。",
      "版式：主体四列表。",
      "列：本月 / 上月 / 去年同期 / 本月预算。",
      "营业收入 12,860 / 12,110 / 10,861 / 12,200",
      "营业成本 7,999 / 7,569 / 6,886 / 7,564",
      "净利润 1,016 / 966 / 714 / 1,020",
    ].join("\n");
    const outline = outlineFromBrief(brief);
    assert.equal(outline.length, 4);
    assert.equal(classifyExhibit(outline[1]!, 1, 4), "kpi");
    assert.equal(classifyExhibit(outline[2]!, 2, 4), "chart");
    assert.equal(classifyExhibit(outline[3]!, 3, 4), "table");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "host-cheng-"));
    createEmptyProject(dir, { title: "生成中" });
    const result = await runGenerateAsync({
      projectRoot: dir,
      brief,
      brain: createHostBrain({ designSystemId: "consulting/pine-green-strategy" }),
    });
    assert.equal(result.status, "ready");
    assert.equal(result.composeSource, "host-produce");
    const project = loadProject(dir);
    assert.equal(project.pages.length, 4);
    const types = project.pages.flatMap((p) => p.page.elements.map((e) => e.elementType));
    assert.ok(types.includes("table"));
    assert.ok(types.includes("chart"));
    const blob = JSON.stringify(project.pages.map((p) => p.page.elements));
    assert.match(blob, /12,860|1,016|1\.286|37\.8/);
    assert.doesNotMatch(blob, /种子怎么发芽/);
  });

  it("skips LLM compression on a scripted deck", async () => {
    let called = 0;
    const llm: LlmPort = {
      completeJson: async () => {
        called += 1;
        return { title: "压缩掉了", kicker: "x", lines: ["短"] };
      },
    };
    const brief = twentyPageScript();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "host-skip-llm-"));
    const project = createEmptyProject(dir, { title: "生成中" });
    const brain = createHostBrain({ llm });
    assert.equal(brain.kind, "host");
    const tools: string[] = [];
    await brain.run({
      brief,
      project,
      emit: (step: ToolStep) => {
        tools.push(step.tool);
      },
      emitUpdate: () => undefined,
    });
    assert.equal(called, 0);
    assert.equal(tools[0], "think");
    assert.equal(tools[1], "write_todo");
    assert.equal(tools.filter((t) => t === "write_page").length, 20);
    assert.ok(tools.includes("review_pages"));
    assert.ok(tools.includes("compose_deck"));
    assert.equal(tools.indexOf("write_todo") < tools.indexOf("write_page"), true);
    assert.equal(tools.indexOf("write_page") < tools.indexOf("review_pages"), true);
    assert.equal(tools.indexOf("review_pages") < tools.indexOf("compose_deck"), true);
    const painted = loadProject(dir);
    assert.equal(painted.pages.length, 20);
    const blob = JSON.stringify(painted.pages.map((p) => p.page.elements));
    assert.match(blob, /12,860|1\.286|1,016/);
    assert.doesNotMatch(blob, /压缩掉了/);
  });

  it("rasters a page when the raster port is configured", async () => {
    let renders = 0;
    const raster: PageRasterPort = {
      available: true,
      render: async () => {
        renders += 1;
        return {
          kind: "native-slide",
          width: 960,
          height: 540,
          bytes: Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(80, 3)]),
          note: "test",
        };
      },
    };
    const brief = [
      "【第1页 封面：澄光生活7月经营月报】",
      "结论：封面不放经营数字。本页保留脚本正文。",
      "【第2页 核心KPI仪表盘】",
      "结论：7月营收1.286亿。锁定 12,860 万。",
      "【第3页 附录】",
      "本报告数据均为虚构，仅用于演示。口径写在附录。",
    ].join("\n");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "host-raster-"));
    const project = createEmptyProject(dir, { title: "生成中" });
    const brain = createHostBrain({ raster, projectRoot: dir });
    await brain.run({
      brief,
      project,
      emit: () => undefined,
      emitUpdate: () => undefined,
    });
    assert.equal(renders, 3);
    assert.ok(fs.existsSync(path.join(dir, "_agent", "rasters", "page-01.png")));
  });
});
