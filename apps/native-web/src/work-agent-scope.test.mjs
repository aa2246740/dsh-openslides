import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { targetFromAssistantIntent } from "../public/work-agent-scope.js";

describe("validated model scope is the only edit target", () => {
  const context = { pagePaths: ["pages/1_cover.page", "pages/2_tips.page", "pages/3_summary.page"], pageIndex: 2 };
  const plan = pages => ({ ok: true, intent: "edit", scope: "pages", pages });
  it("preserves pages 1 and 2 despite the old parser misreading the user's exact phrase", () => {
    // The model plan for “1、2两页都把背景色改成白色” is already semantic.
    const target = targetFromAssistantIntent(plan([1, 2]), context);
    assert.deepEqual(target.targetPageIds, ["1_cover", "2_tips"]);
    assert.equal(target.scope, "pages");
    assert.deepEqual(target.pageIndexes, [0, 1]);
  });
  it("does not turn explicit page numbers into a whole-deck request", () => {
    const target = targetFromAssistantIntent(plan([2, 1, 2]), { ...context, pagePaths: context.pagePaths.slice(0, 2), pageIndex: 1 });
    assert.equal(target.scope, "pages");
    assert.deepEqual(target.targetPageIds, ["1_cover", "2_tips"]);
  });
  it("preserves exclusions and rejects invalid decisions instead of falling back to the current page", () => {
    assert.deepEqual(targetFromAssistantIntent(plan([2]), context).targetPageIds, ["2_tips"]);
    for (const pages of [[], [0], [4], [1.5], ["2"]]) assert.equal(targetFromAssistantIntent(plan(pages), context).ok, false);
    assert.equal(targetFromAssistantIntent({ok:true,intent:"edit",scope:"unknown"},context).ok,false);
    assert.equal(targetFromAssistantIntent({ok:true,intent:"discuss",scope:"current"},context).ok,false);
  });
  it("binds current-page and selection references to the actual editor context", () => {
    const current = {ok:true,intent:"edit",scope:"current"};
    assert.deepEqual(targetFromAssistantIntent(current,context).targetPageIds,["3_summary"]);
    const selected = {...current,scope:"selection"};
    assert.equal(targetFromAssistantIntent(selected,context).ok,false);
    assert.deepEqual(targetFromAssistantIntent(selected,{...context,selectedElements:[{id:"title",label:"标题"}]}).elementIds,["title"]);
    assert.equal(targetFromAssistantIntent(selected,{...context,selectedElements:[null]}).ok,false);
  });
  it("maps structural plans to a deck target that keeps every baseline page plus the insertion point", () => {
    const append = targetFromAssistantIntent({ok:true,intent:"edit",scope:"deck",structureOnly:true,insertIndex:3},context);
    assert.equal(append.ok,true);
    assert.equal(append.scope,"deck");
    assert.equal(append.structureOnly,true);
    assert.equal(append.insertIndex,3);
    assert.deepEqual(append.targetPageIds,["1_cover","2_tips","3_summary"]);
    assert.equal(append.pageIndex,2); // anchor stays on the current page
    assert.match(append.label,/结构调整/);
    const middle = targetFromAssistantIntent({ok:true,intent:"edit",scope:"deck",structureOnly:true,insertIndex:1},context);
    assert.equal(middle.insertIndex,1);
    assert.match(middle.label,/第 1 页后新增页面/);
    for (const insertIndex of [-1,4,1.5,"2"]) {
      assert.equal(targetFromAssistantIntent({ok:true,intent:"edit",scope:"deck",structureOnly:true,insertIndex},context).ok,false,`insertIndex ${insertIndex}`);
    }
    // A pages-scoped plan without the structural flag is unaffected.
    assert.equal(targetFromAssistantIntent(plan([1]),context).structureOnly,undefined);
  });
  it("carries the editable baseline whitelist and add count for compound structural plans", () => {
    const compound = targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,insertIndex:3,editablePages:[2],addCount:1},context);
    assert.equal(compound.ok,true);
    assert.deepEqual(compound.editablePageIds,["2_tips"]);
    assert.equal(compound.expectedAddCount,1);
    assert.match(compound.label,/可改第 2 页/);
    const multi = targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,insertIndex:0,addCount:3},context);
    assert.equal(multi.expectedAddCount,3);
    assert.match(multi.label,/×3/);
    assert.equal(multi.editablePageIds,undefined);
    // Out-of-range editable pages fail closed.
    assert.equal(targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,insertIndex:3,editablePages:[4]},context).ok,false);
  });
  it("maps delete plans to a structural target without an insert position", () => {
    const del = targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,deletablePages:[2]},context);
    assert.equal(del.ok,true);
    assert.equal(del.insertIndex,undefined);
    assert.deepEqual(del.deletablePageIds,["2_tips"]);
    assert.match(del.label,/删除第 2 页/);
    // Merge: survivor editable + absorbed deletable.
    const merge = targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,editablePages:[1],deletablePages:[2]},context);
    assert.deepEqual(merge.editablePageIds,["1_cover"]);
    assert.deepEqual(merge.deletablePageIds,["2_tips"]);
    assert.match(merge.label,/删除第 2 页/);
    // Overlap and out-of-range delete claims fail closed.
    assert.equal(targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,editablePages:[2],deletablePages:[2]},context).ok,false);
    assert.equal(targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,deletablePages:[9]},context).ok,false);
    // A structural plan with neither add nor delete is meaningless.
    assert.equal(targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true},context).ok,false);
  });
  it("maps reorderTo to an ordered page-id permutation and rejects no-ops", () => {
    const move = targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,reorderTo:[3,1,2]},context);
    assert.equal(move.ok,true);
    assert.deepEqual(move.reorderPageIds,["3_summary","1_cover","2_tips"],"order is the payload — never sorted");
    assert.equal(move.insertIndex,undefined);
    assert.match(move.label,/重排/);
    // Non-permutations and identity orders fail closed.
    assert.equal(targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,reorderTo:[3,1]},context).ok,false);
    assert.equal(targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,reorderTo:[1,2,3]},context).ok,false);
    assert.equal(targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,reorderTo:[3,1,9]},context).ok,false);
  });
  it("maps a rewrite plan to a deck-wide rewrite target", () => {
    const target = targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",rewrite:true},context);
    assert.equal(target.ok,true);
    assert.equal(target.rewrite,true);
    assert.equal(target.scope,"deck");
    assert.deepEqual(target.targetPageIds,["1_cover","2_tips","3_summary"]);
    assert.equal(target.structureOnly,undefined,"a rewrite never carries the structural flag");
    assert.match(target.label,/整稿重写/);
    // rewrite must not mix with structureOnly or a page scope.
    assert.equal(targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",rewrite:true,structureOnly:true,insertIndex:1},context).ok,false);
    assert.equal(targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"pages",pages:[1],rewrite:true},context).ok,false);
  });
  it("carries editableMeta through to the lock target on any scope", () => {
    const meta = targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"current",editableMeta:["title"]},context);
    assert.equal(meta.ok,true);
    assert.deepEqual(meta.editableMeta,["title"]);
    // A title-only request takes the least-privilege meta scope — the anchor
    // page is frozen too; only update_deck may move the whitelisted fields.
    assert.equal(meta.scope,"meta","a title-only request is meta-only, not a page edit");
    assert.match(meta.label,/文稿元数据/);
    // Compound: structural insert plus a theme grant.
    const compound = targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",structureOnly:true,insertIndex:1,editableMeta:["title","theme"]},context);
    assert.equal(compound.ok,true);
    assert.deepEqual(compound.editableMeta,["title","theme"]);
    assert.match(compound.label,/可改文稿标题、主题/);
    // Unknown fields are dropped; a rewrite drops the field entirely.
    const filtered = targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"current",editableMeta:["title","footer"]},context);
    assert.deepEqual(filtered.editableMeta,["title"]);
    const rewrite = targetFromAssistantIntent(
      {ok:true,intent:"edit",scope:"deck",rewrite:true,editableMeta:["title"]},context);
    assert.equal(rewrite.editableMeta,undefined,"a rewrite already covers deck metadata");
  });
});
