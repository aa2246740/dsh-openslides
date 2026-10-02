import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadProject } from "@open-slidestudio/pptd-v2";
import { runGenerate, runGenerateAsync } from "./index.js";

describe("agent-harness", () => {
  it("generates multi-page PPTD offline with tool steps", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-"));
    const result = runGenerate({
      projectRoot: dir,
      brief: "华北区域 Q3 增长复盘：试点成效与下周动作",
    });
    assert.equal(result.status, "ready");
    assert.ok(result.steps.every((s) => s.status === "completed"));
    assert.ok(result.steps.some((s) => s.tool === "compose_deck"));
    const think = result.steps.find((s) => s.tool === "think");
    const plan = result.steps.find((s) => s.tool === "plan");
    assert.ok(think?.detail && think.detail.length > 20);
    assert.notEqual(think?.summary, "ok");
    assert.ok(plan?.detail && /cover|content/.test(plan.detail));
    assert.notEqual(plan?.summary, "ok");
    const project = loadProject(dir);
    assert.ok(project.pages.length >= 2);
    assert.match(project.presentation.title ?? "", /华北|增长|复盘/);
    const validate = result.steps.find((s) => s.tool === "validate");
    const version = result.steps.find((s) => s.tool === "version_snapshot");
    assert.notEqual(validate?.summary, "ok");
    assert.match(String(validate?.summary), /pages/);
    assert.notEqual(version?.summary, "ok");
    assert.match(String(version?.summary), /V1/);
    const reason = JSON.parse(fs.readFileSync(path.join(dir, "generate-reason.json"), "utf8"));
    assert.equal(reason.brief, "华北区域 Q3 增长复盘：试点成效与下周动作");
    assert.ok(reason.think?.detail?.length > 20);
    assert.ok(reason.plan?.detail?.length > 20);
  });

  it("async path can export pptx offline", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-exp-"));
    const result = await runGenerateAsync({
      projectRoot: dir,
      brief: "导出链路测试",
      exportPptx: true,
    });
    assert.equal(result.status, "ready");
    assert.ok(result.steps.some((s) => s.tool === "export_pptx" && s.status === "completed"));
    assert.ok(result.pptxPath && fs.existsSync(result.pptxPath));
    assert.ok((result.exportBytes ?? 0) > 1000);
  });

  it("streams think/plan as running then completed with readable detail", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-reason-"));
    const events: { tool: string; status: string; summary?: string; detail?: string }[] = [];
    const result = await runGenerateAsync({
      projectRoot: dir,
      brief: "介绍一下勾股定理，面向小学生",
      onStep: (step) => {
        events.push({
          tool: step.tool,
          status: step.status,
          summary: step.summary,
          detail: step.detail,
        });
      },
    });
    assert.equal(result.status, "ready");
    const thinkEv = events.filter((e) => e.tool === "think");
    assert.ok(thinkEv.some((e) => e.status === "running"));
    const thinkRunning = thinkEv.filter((e) => e.status === "running" && (e.detail || "").length > 0);
    assert.ok(thinkRunning.length >= 2, "Think must stream detail while running");
    for (let i = 1; i < thinkRunning.length; i++) {
      assert.ok((thinkRunning[i]!.detail || "").startsWith(thinkRunning[i - 1]!.detail || ""));
    }
    assert.ok(thinkEv.some((e) => e.status === "completed" && e.detail && /小学生/.test(e.detail)));
    assert.ok(!thinkEv.some((e) => e.summary === "ok"));
    const planEv = events.filter((e) => e.tool === "plan");
    const planRunning = planEv.filter((e) => e.status === "running" && (e.detail || "").length > 0);
    assert.ok(planRunning.length >= 2, "Plan must stream detail while running");
    assert.ok(planEv.some((e) => e.status === "completed" && e.detail && /cover/.test(e.detail)));
    const planDone = planEv.find((e) => e.status === "completed");
    assert.doesNotMatch(String(planDone?.detail), /下周动作|四个支撑面/);
    assert.match(String(planDone?.detail), /课堂|带走|勾股/);
    const composeEv = events.filter((e) => e.tool === "compose_deck");
    assert.ok(composeEv.some((e) => e.status === "running" && (e.detail || "").length > 0));
    const validate = result.steps.find((s) => s.tool === "validate");
    const version = result.steps.find((s) => s.tool === "version_snapshot");
    assert.notEqual(validate?.summary, "ok");
    assert.notEqual(version?.summary, "ok");
    assert.ok(fs.existsSync(path.join(dir, "generate-reason.json")));
  });
});
