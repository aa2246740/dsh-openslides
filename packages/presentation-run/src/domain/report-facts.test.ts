import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferDeckIntent, classifyBriefKind } from "./compose-ir.js";
import { missingOperatingFactsReason, NEED_DATA_REASON, reportBriefNeedsFacts } from "./report-facts.js";
import { executeGenerateTool, type AgentToolState } from "./agent-tools.js";
import { loadPlaybook } from "./playbook.js";

const HARNESS =
  "闸门复现灯开关\n两页即可：封面 + 结束页。不要做成经营月报，不要做成课件。虚构车间灯开关验收。封面写题目，结束页必须有标题、一句收束、下次验收项。数字自拟。";

describe("negated 经营月报 is not a monthly-report brief", () => {
  it("does not classify 不要做成经营月报 as report or demand KPI facts", () => {
    assert.notEqual(inferDeckIntent(HARNESS), "report");
    assert.equal(reportBriefNeedsFacts(HARNESS), false);
    assert.equal(missingOperatingFactsReason(HARNESS), undefined);
  });

  it("still refuses a real 经营月报 with no company and no numbers", () => {
    const monthly = "澄光生活 2026年7月经营月报";
    assert.equal(inferDeckIntent(monthly), "report");
    assert.equal(reportBriefNeedsFacts(monthly), true);
    assert.equal(missingOperatingFactsReason(monthly), NEED_DATA_REASON);
  });

  it("does not treat 董事会半年经营汇报 or 青岚产品介绍 as 澄光月报 要数据", () => {
    const beilu =
      "给公司董事会做一份「北麓制造 2026 上半年经营汇报」。不是门店月报，不是产品立项。16 页左右。虚构演示数据。不要个人答辩。";
    const qinglan =
      "给管理层做一份「青岚费控」产品介绍，办公立项用。16 页左右。不要做成经营月报，不要澄光生活。";
    assert.equal(classifyBriefKind(beilu), "board-h1");
    assert.equal(reportBriefNeedsFacts(beilu), false);
    assert.equal(missingOperatingFactsReason(beilu), undefined);
    assert.equal(classifyBriefKind(qinglan), "product-intro");
    assert.equal(reportBriefNeedsFacts(qinglan), false);
    assert.equal(missingOperatingFactsReason(qinglan), undefined);
    const share =
      "给同事做一次内部「学习分享」。不是经营月报，不是产品立项。16 页。不要编造收入、毛利。";
    assert.equal(classifyBriefKind(share), "learn-share");
    assert.equal(reportBriefNeedsFacts(share), false);
  });

  it("write_page on the harness brief is not blocked as 要数据", () => {
    const playbook = loadPlaybook({ hostDefaults: false });
    const state: AgentToolState = {
      brief: HARNESS,
      playbook,
      todos: [],
      researchNotes: [],
      writtenPages: [],
    };
    const write = executeGenerateTool(
      "write_page",
      {
        id: "cover",
        pageType: "cover",
        elements: [
          {
            elementId: "bg",
            elementType: "shape",
            shapeName: "rect",
            bounds: [0, 0, 960, 540],
            fill: { type: "solid", color: "#020307" },
          },
          {
            elementId: "title",
            elementType: "text",
            bounds: [60, 160, 520, 110],
            content: { text: "闸门复现灯开关", fontSize: 54, color: "#F7F8FA" },
          },
        ],
      },
      state,
    );
    assert.notEqual(write.summary, "要数据");
    assert.notEqual((write.payload as { error?: string }).error, "need_data");
  });
});
