import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { thinkAboutBrief, planFromDeck, localPlan } from "./reason.js";
import { deterministicDeck } from "./compose-ir.js";

describe("generate reason", () => {
  it("thinks about a Chinese brief instead of saying ok", () => {
    const block = thinkAboutBrief("介绍一下勾股定理，面向小学生");
    assert.notEqual(block.summary, "ok");
    assert.match(block.summary, /小学生/);
    assert.match(block.detail, /勾股定理/);
    assert.match(block.detail, /受众：小学生/);
    assert.match(block.detail, /不编造/);
  });

  it("plans the same pages the playbook will materialize", () => {
    const deck = deterministicDeck("介绍一下勾股定理，面向小学生", "consulting/pine-green-strategy");
    const block = planFromDeck(deck);
    assert.match(block.summary, /页/);
    assert.match(block.detail, /cover/);
    assert.doesNotMatch(block.detail, /下周动作|四个支撑面|证据位：待补/);
    assert.match(block.detail, /今天带走什么|课堂例子/);
    assert.ok(block.detail.split("\n").length >= deck.pages.length);
    const local = localPlan("介绍一下勾股定理，面向小学生");
    assert.equal(local.deck.pages.length, deck.pages.length);
    assert.equal(local.reason.detail, block.detail);
  });

  it("thinks a classroom brief is a lesson, not a consulting recap", () => {
    const block = thinkAboutBrief("介绍一下勾股定理，面向小学生");
    assert.match(block.detail, /课堂路径|不套咨询/);
  });

  it("rejects an empty brief", () => {
    assert.throws(() => thinkAboutBrief("   "), /brief required/);
  });
});
