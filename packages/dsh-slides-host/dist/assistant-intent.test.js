import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assistantIntentHistory, explicitlyReadOnly, inferAssistantIntent, parseAssistantIntent } from "./assistant-intent.js";
import { recordConversationMessage } from "./assistant-conversation.js";
const input = { text: "就按第二个方案来", pageCount: 2, currentPage: 1, selectedCount: 0, history: [{ role: "assistant", at: "2026-09-20T10:00:00Z", text: "第二个方案：把第2页标题改短。" }] };
test("uses the selected model and recent conversation without giving the classifier tools", async () => {
    let seen;
    const result = await inferAssistantIntent(async function* (options) {
        assert.equal(options.temperature, undefined, "registered models may reject explicit temperature");
        seen = options;
        yield { type: "block-end", index: 0, block: { type: "text", text: '{"intent":"edit","scope":"pages","pages":[2],"scopeEvidence":{"source":"continuation","quote":"就按第二个方案来","historyQuote":"第二个方案：把第2页标题改短。"}}' } };
        yield { type: "finish", reason: { kind: "stop" } };
    }, { provider: "local", model: "cheap-model" }, input);
    assert.deepEqual(result, { intent: "edit", scope: "pages", pages: [2] });
    assert.match(String(seen?.system), /先给我选项，选完直接修改.*edit/);
    assert.equal(seen?.provider, "local");
    assert.equal(seen?.model, "cheap-model");
    assert.equal(seen?.tools, undefined);
    assert.match(JSON.stringify(seen?.messages), /第二个方案.*第2页标题/);
});
test("explicit discussion never starts a model classification or grants writes", async () => {
    for (const text of ["先别改，聊聊风格", "不修改页面，给我建议", "只回复标题，暂时不修改文稿"]) {
        let called = false;
        const result = await inferAssistantIntent(async function* () { called = true; yield {}; }, { provider: "x", model: "y" }, { ...input, text });
        assert.equal(called, false);
        assert.equal(result.intent, "discuss");
        assert.equal(parseAssistantIntent('{"intent":"edit","scope":"deck"}', { ...input, text }).intent, "discuss");
    }
});
test("an exclusion clause is not a read-only request", () => {
    for (const text of ["把第1页标题改大，不要修改页面 2", "不要修改其他页面，第2页换背景", "其他页不要改，只改这一页的标题"]) {
        assert.equal(explicitlyReadOnly(text), false, text);
    }
    for (const text of ["不要修改页面，只给建议", "先别改，先给我两个方案看看", "只讨论"]) {
        assert.equal(explicitlyReadOnly(text), true, text);
    }
});
test("scope restrictions do not confuse a targeted edit with discussion", () => {
    assert.deepEqual(parseAssistantIntent('{"intent":"edit","scope":"pages","pages":[2],"scopeEvidence":{"source":"request","quote":"第2页"}}', { ...input, text: "改第2页标题，其他页不要改" }), { intent: "edit", scope: "pages", pages: [2] });
});
test("invalid, out-of-range and missing selection decisions fail closed", () => {
    for (const raw of ['{}', '{"intent":"x"}', '{"intent":"edit","scope":"pages","pages":[3]}', '{"intent":"edit","scope":"pages","pages":[1.5]}', '{"intent":"edit","scope":"selection"}'])
        assert.throws(() => parseAssistantIntent(raw, input));
    assert.deepEqual(parseAssistantIntent('{"intent":"generate"}', { ...input, pageCount: 0 }), { intent: "generate", scope: "current", pages: [] });
});
test("model failures never become generation decisions", async () => {
    await assert.rejects(inferAssistantIntent(async function* () { yield { type: "finish", reason: { kind: "max-tokens" } }; }, { provider: "x", model: "y" }, input), /输入内容已保留/);
});
test("history contains public dialogue only and merges streamed assistant chunks", t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-intent-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    recordConversationMessage(root, "先聊结构", "discuss");
    fs.writeFileSync(path.join(root, "_agent/agent-trace.jsonl"), [
        { id: "reason", kind: "reasoning", detail: "private", at: "2026-09-20T01:00:00Z" },
        { id: "tool", kind: "tool", detail: "internal", at: "2026-09-20T01:00:00Z" },
        { id: "a", kind: "message", detail: "建议", at: "2026-09-20T01:00:01Z" },
        { id: "a", kind: "message", detail: "两页", detailMode: "append", at: "2026-09-20T01:00:02Z" },
    ].map(v => JSON.stringify(v)).join("\n"));
    const history = assistantIntentHistory(root);
    assert.equal(history.length, 2);
    assert.equal(history.find(x => x.role === "assistant")?.text, "建议两页");
});
test("answered native questions remain available to the next intent decision", t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-intent-question-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "_agent"));
    fs.writeFileSync(path.join(root, "_agent/assistant-questions.v1.json"), JSON.stringify([
        { id: "q", at: "2026-09-20T01:00:00Z", answeredAt: "2026-09-20T01:00:02Z", status: "answered", questions: [{ id: "palette", question: "两页用什么配色？" }], answer: { answers: [{ id: "palette", selected: ["深紫"] }] } },
        { id: "pending", at: "2026-09-20T01:00:03Z", status: "pending", questions: [{ id: "private", question: "还没选" }] },
    ]));
    assert.deepEqual(assistantIntentHistory(root), [{ role: "user", at: "2026-09-20T01:00:02Z", text: "两页用什么配色？：深紫" }]);
});
test("non-current decisions require evidence from the latest request, not an old whole-deck task", () => {
    const request = { ...input, text: "用SVG设计点背景吧", history: [{ role: "user", at: "2026-09-20T10:00:00Z", text: "整份演示文稿都用深蓝色背景" }] };
    for (const scopeEvidence of [undefined, { source: "request", quote: "整份演示文稿" }, { source: "history", quote: request.text }, { source: "continuation", quote: request.text, historyQuote: "不存在的范围" }]) {
        assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", pages: [], scopeEvidence }), request), /尚未执行/);
    }
    assert.deepEqual(parseAssistantIntent('{"intent":"edit","scope":"current","pages":[]}', request), { intent: "edit", scope: "current", pages: [] });
});
test("explicit page lists, whole-deck requests and selected objects keep their exact scope", () => {
    for (const [text, scope, pages, quote] of [
        ["1、2两页都把背景色改成白色", "pages", [1, 2], "1、2两页"],
        ["整份文稿都换配色", "deck", [], "整份文稿"],
        ["把选中的标题变大", "selection", [], "选中的标题"],
    ]) {
        assert.deepEqual(parseAssistantIntent(JSON.stringify({ intent: "edit", scope, pages, scopeEvidence: { source: "request", quote } }), { ...input, text, selectedCount: 1 }), { intent: "edit", scope, pages: [...pages] });
    }
});
test("a literal quote without range words cannot authorize the whole deck", () => {
    const text = "把背景色改成 #162A46，文字和元素位置保持原样。";
    const result = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", pages: [], scopeEvidence: { source: "request", quote: text } }), { text, pageCount: 2, selectedCount: 0, history: [] });
    assert.deepEqual(result, { intent: "edit", scope: "current", pages: [] });
});
test("all content and an entire background do not name all slides", () => {
    for (const text of ["背景改成白色，全部文字保持原样", "整个背景换成白色", "用SVG设计点背景吧"]) {
        assert.deepEqual(parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", pages: [], scopeEvidence: { source: "request", quote: text } }), { text, pageCount: 2, selectedCount: 0, history: [] }), { intent: "edit", scope: "current", pages: [] });
    }
});
test("page-list requests parse as deck-level structural edits with an insertion position", () => {
    const text = "多加一页再见的页面吧";
    assert.deepEqual(parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "current", pages: [], structureOnly: true, insertIndex: 3, scopeEvidence: { source: "request", quote: "多加一页" } }), { text, pageCount: 3, selectedCount: 0, history: [] }), { intent: "edit", scope: "deck", pages: [], structureOnly: true, insertIndex: 3 });
    const insert = "在第2页后面插入一页目录";
    assert.deepEqual(parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "pages", pages: [2], structureOnly: true, insertIndex: 2, scopeEvidence: { source: "request", quote: "在第2页后面插入一页" } }), { text: insert, pageCount: 5, selectedCount: 0, history: [] }), { intent: "edit", scope: "deck", pages: [], structureOnly: true, insertIndex: 2 });
    // insertIndex omitted defaults to appending at the end.
    const trailing = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, scopeEvidence: { source: "request", quote: "再补一页" } }), { text: "再补一页", pageCount: 4, selectedCount: 0, history: [] });
    assert.deepEqual(trailing, { intent: "edit", scope: "deck", pages: [], structureOnly: true, insertIndex: 4 });
});
test("structural claims still need grounded structure evidence and a valid insertIndex", () => {
    const input3 = { text: "多加一页再见的页面吧", pageCount: 3, selectedCount: 0, history: [] };
    // A structural flag without structural words in the quote fails closed.
    assert.deepEqual(parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, insertIndex: 3, scopeEvidence: { source: "request", quote: "再见的页面" } }), input3), { intent: "edit", scope: "current", pages: [] });
    // 页码/页眉/页脚 are not page-list mutations.
    assert.deepEqual(parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, insertIndex: 2, scopeEvidence: { source: "request", quote: "给标题加一页码" } }), { text: "给标题加一页码", pageCount: 3, selectedCount: 0, history: [] }), { intent: "edit", scope: "current", pages: [] });
    // Content edits of a numbered page never validate as page-list mutations.
    for (const text of ["补充第2页的内容", "插入图片到第2页"]) {
        assert.deepEqual(parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, insertIndex: 1, scopeEvidence: { source: "request", quote: text } }), { text, pageCount: 3, selectedCount: 0, history: [] }), { intent: "edit", scope: "current", pages: [] }, text);
    }
    // Duplicating an anchored page is a page-list mutation.
    const dup = "复制第3页放在最后";
    assert.deepEqual(parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, insertIndex: 3, scopeEvidence: { source: "request", quote: "复制第3页" } }), { text: dup, pageCount: 3, selectedCount: 0, history: [] }), { intent: "edit", scope: "deck", pages: [], structureOnly: true, insertIndex: 3 });
    for (const insertIndex of [-1, 4, 1.5, "2"]) {
        assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, insertIndex, scopeEvidence: { source: "request", quote: "多加一页" } }), input3));
    }
});
test("a compound structural request carries the editable baseline pages and add count", () => {
    const text = "末尾再加一页总结，顺便把第2页标题改大";
    const raw = JSON.stringify({ intent: "edit", scope: "deck", pages: [], structureOnly: true, insertIndex: 5, editablePages: [2], addCount: 1, scopeEvidence: { source: "request", quote: "末尾再加一页总结" } });
    assert.deepEqual(parseAssistantIntent(raw, { text, pageCount: 5, selectedCount: 0, history: [] }), { intent: "edit", scope: "deck", pages: [], structureOnly: true, insertIndex: 5, editablePages: [2], addCount: 1 });
    // editablePages only rides along with structureOnly.
    assert.deepEqual(parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "pages", pages: [2], editablePages: [2], scopeEvidence: { source: "request", quote: "第2页" } }), { text: "改第2页", pageCount: 5, selectedCount: 0, history: [] }), { intent: "edit", scope: "pages", pages: [2] });
    // Out-of-range editable page numbers fail closed.
    for (const editablePages of [[6], [0], [1.5], "2"]) {
        assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, insertIndex: 5, editablePages, scopeEvidence: { source: "request", quote: "再加一页" } }), { text: "再加一页", pageCount: 5, selectedCount: 0, history: [] }));
    }
    // addCount must be a sane positive integer.
    for (const addCount of [0, -1, 1.5, "3", 200]) {
        assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, insertIndex: 5, addCount, scopeEvidence: { source: "request", quote: "加几页" } }), { text: "加几页", pageCount: 5, selectedCount: 0, history: [] }));
    }
});
test("delete/merge/split requests carry deletablePages without an add position", () => {
    const del = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, deletablePages: [3], scopeEvidence: { source: "request", quote: "把第3页删掉" } }), { text: "把第3页删掉", pageCount: 5, selectedCount: 0, history: [] });
    assert.equal(del.structureOnly, true);
    assert.equal(del.insertIndex, undefined, "pure delete must not gain an append authorization");
    assert.deepEqual(del.deletablePages, [3]);
    // Merge = keep+edit the survivor, delete the absorbed page.
    const merge = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, editablePages: [2], deletablePages: [3], scopeEvidence: { source: "request", quote: "把第2、3页合并成一页" } }), { text: "把第2、3页合并成一页", pageCount: 5, selectedCount: 0, history: [] });
    assert.equal(merge.insertIndex, undefined);
    assert.deepEqual(merge.editablePages, [2]);
    assert.deepEqual(merge.deletablePages, [3]);
    // Delete + add compound keeps both halves.
    const combo = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, insertIndex: 5, deletablePages: [3], scopeEvidence: { source: "request", quote: "删掉第3页，末尾再加一页总结" } }), { text: "删掉第3页，末尾再加一页总结", pageCount: 5, selectedCount: 0, history: [] });
    assert.equal(combo.insertIndex, 5);
    assert.deepEqual(combo.deletablePages, [3]);
    // "删掉第2页的标题" is a content edit — the page object followed by 的 must
    // not authorize a page removal.
    const notDelete = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, deletablePages: [2], scopeEvidence: { source: "request", quote: "删掉第2页的标题" } }), { text: "删掉第2页的标题", pageCount: 5, selectedCount: 0, history: [] });
    assert.equal(notDelete.scope, "current", "content-delete must not become a page-list authorization");
    // editable/deletable overlap is contradictory and fails closed.
    assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, insertIndex: 5, editablePages: [2], deletablePages: [2], scopeEvidence: { source: "request", quote: "加一页" } }), { text: "加一页", pageCount: 5, selectedCount: 0, history: [] }));
    // Out-of-range deletable pages fail closed.
    assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, deletablePages: [9], scopeEvidence: { source: "request", quote: "删掉第9页" } }), { text: "删掉第9页", pageCount: 5, selectedCount: 0, history: [] }));
});
test("reorder requests carry reorderTo as a full permutation without add/delete", () => {
    const move = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, reorderTo: [3, 1, 2, 4], scopeEvidence: { source: "request", quote: "把第3页挪到最前面" } }), { text: "把第3页挪到最前面", pageCount: 4, selectedCount: 0, history: [] });
    assert.equal(move.structureOnly, true);
    assert.deepEqual(move.reorderTo, [3, 1, 2, 4]);
    assert.equal(move.insertIndex, undefined, "a pure reorder must not gain an append authorization");
    assert.equal(move.deletablePages, undefined);
    const swap = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, reorderTo: [1, 4, 3, 2, 5], scopeEvidence: { source: "request", quote: "第2页和第4页对调" } }), { text: "第2页和第4页对调", pageCount: 5, selectedCount: 0, history: [] });
    assert.deepEqual(swap.reorderTo, [1, 4, 3, 2, 5]);
    // Not a permutation → fail closed.
    assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, reorderTo: [3, 1, 2], scopeEvidence: { source: "request", quote: "把第3页挪到最前面" } }), { text: "把第3页挪到最前面", pageCount: 4, selectedCount: 0, history: [] }));
    assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, reorderTo: [3, 3, 2, 1], scopeEvidence: { source: "request", quote: "把第3页挪到最前面" } }), { text: "把第3页挪到最前面", pageCount: 4, selectedCount: 0, history: [] }));
    // Reorder cannot mix with add/remove in one turn.
    assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, reorderTo: [3, 1, 2, 4], deletablePages: [2], scopeEvidence: { source: "request", quote: "把第3页挪到最前面" } }), { text: "把第3页挪到最前面", pageCount: 4, selectedCount: 0, history: [] }));
    // No move-words in the request → falls back to current page.
    const noEvidence = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, reorderTo: [3, 1, 2, 4], scopeEvidence: { source: "request", quote: "封面配色换成蓝色" } }), { text: "封面配色换成蓝色", pageCount: 4, selectedCount: 0, history: [] });
    assert.equal(noEvidence.scope, "current");
});
test("the intent payload includes the ordered page inventory for semantic anchors", async () => {
    let seen;
    await inferAssistantIntent(async function* (options) {
        seen = options;
        yield { type: "block-end", index: 0, block: { type: "text", text: '{"intent":"edit","scope":"current","pages":[]}' } };
        yield { type: "finish", reason: { kind: "stop" } };
    }, { provider: "local", model: "m" }, { ...input, pages: [{ id: "1_cover", title: "封面：城市步行", position: 1 }, { id: "2_points", title: "两条建议", position: 2 }] });
    const first = seen?.messages?.[0]?.content?.[0];
    const payload = JSON.parse(first && "text" in first && typeof first.text === "string" ? first.text : "{}");
    assert.deepEqual(payload.pages, [{ id: "1_cover", title: "封面：城市步行", position: 1 }, { id: "2_points", title: "两条建议", position: 2 }]);
});
test("rewrite intent requires deck scope and strong redo evidence", () => {
    const rewrite = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", rewrite: true, scopeEvidence: { source: "request", quote: "推翻重新生成" } }), { text: "完全不满意，推翻重新生成这份PPT", pageCount: 5, selectedCount: 0, history: [] });
    assert.equal(rewrite.rewrite, true);
    assert.equal(rewrite.scope, "deck");
    assert.equal(rewrite.structureOnly, undefined);
    assert.deepEqual(rewrite.pages, []);
    const rewrite2 = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", rewrite: true, scopeEvidence: { source: "request", quote: "整稿重写" } }), { text: "整稿重写，按产品方案的思路来", pageCount: 3, selectedCount: 0, history: [] });
    assert.equal(rewrite2.rewrite, true);
    const english = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", rewrite: true, scopeEvidence: { source: "request", quote: "rewrite the whole deck" } }), { text: "please rewrite the whole deck", pageCount: 3, selectedCount: 0, history: [] });
    assert.equal(english.rewrite, true);
    // Weak evidence — "不满意" alone or a page-anchored redo is not a rewrite.
    const weak = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", rewrite: true, scopeEvidence: { source: "request", quote: "不太满意" } }), { text: "不太满意", pageCount: 3, selectedCount: 0, history: [] });
    assert.equal(weak.scope, "current", "weak dissatisfaction must not authorize a deck wipe");
    const pageAnchored = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", rewrite: true, scopeEvidence: { source: "request", quote: "重写文稿第2页" } }), { text: "重写文稿第2页", pageCount: 5, selectedCount: 0, history: [] });
    assert.equal(pageAnchored.scope, "current", "a page-anchored rewrite request is not a deck rewrite");
    // rewrite cannot combine with structural fields or a page list.
    assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", rewrite: true, structureOnly: true, insertIndex: 2, scopeEvidence: { source: "request", quote: "推翻重来" } }), { text: "推翻重来", pageCount: 5, selectedCount: 0, history: [] }));
    assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", rewrite: true, pages: [2], scopeEvidence: { source: "request", quote: "推翻重来" } }), { text: "推翻重来", pageCount: 5, selectedCount: 0, history: [] }));
});
test("editableMeta grants deck title/theme only with grounded wording", () => {
    // Deck-qualified title wording authorizes the title field on a plain edit.
    const title = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "current", pages: [], editableMeta: ["title"], scopeEvidence: null }), { text: "把文稿标题改成季度总结", pageCount: 4, selectedCount: 0, history: [] });
    assert.deepEqual(title.editableMeta, ["title"]);
    assert.equal(title.scope, "current");
    // A visual theme wording authorizes theme.
    const theme = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", editableMeta: ["theme"], scopeEvidence: { source: "request", quote: "整套配色换成深色" } }), { text: "整套配色换成深色", pageCount: 4, selectedCount: 0, history: [] });
    assert.deepEqual(theme.editableMeta, ["theme"]);
    // Compound: structural add plus a title rename in one request.
    const compound = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", structureOnly: true, insertIndex: 3, editableMeta: ["title"], scopeEvidence: { source: "request", quote: "加一页封面，顺便把文稿标题改成路演版" } }), { text: "加一页封面，顺便把文稿标题改成路演版", pageCount: 3, selectedCount: 0, history: [] });
    assert.equal(compound.structureOnly, true);
    assert.deepEqual(compound.editableMeta, ["title"]);
    // Ambiguous wording gets stripped, not granted: bare "标题" may mean the
    // page title, bare "主题" may mean topic.
    const bareTitle = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "current", pages: [], editableMeta: ["title"], scopeEvidence: null }), { text: "把标题改成更大的标题", pageCount: 4, selectedCount: 0, history: [] });
    assert.equal(bareTitle.editableMeta, undefined);
    const pageTitle = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "pages", pages: [2], editableMeta: ["title"], scopeEvidence: { source: "request", quote: "把第2页标题改大" } }), { text: "把第2页标题改大", pageCount: 4, selectedCount: 0, history: [] });
    assert.equal(pageTitle.editableMeta, undefined, "a page title edit is content, not deck metadata");
    const bareTheme = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", editableMeta: ["theme"], scopeEvidence: { source: "request", quote: "换个主题讲讲市场" } }), { text: "换个主题讲讲市场", pageCount: 4, selectedCount: 0, history: [] });
    assert.equal(bareTheme.scope, "current");
    // Unknown fields are rejected outright.
    assert.throws(() => parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "current", pages: [], editableMeta: ["footer"], scopeEvidence: null }), { text: "把文稿标题改成季度总结", pageCount: 4, selectedCount: 0, history: [] }));
    // A rewrite already covers title/theme — the field is dropped.
    const rewrite = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", rewrite: true, editableMeta: ["title"], scopeEvidence: { source: "request", quote: "推翻重新生成" } }), { text: "推翻重新生成这份PPT", pageCount: 4, selectedCount: 0, history: [] });
    assert.equal(rewrite.rewrite, true);
    assert.equal(rewrite.editableMeta, undefined);
    // A topic "主题" is not a visual theme — "换个主题讲讲市场" carries no
    // qualifier and must not grant the theme field even on downgrade.
    const topic = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", editableMeta: ["theme"], scopeEvidence: { source: "request", quote: "换个主题讲讲市场" } }), { text: "换个主题讲讲市场", pageCount: 4, selectedCount: 0, history: [] });
    assert.equal(topic.scope, "current");
    assert.equal(topic.editableMeta, undefined, "topic wording must not grant the theme field");
    // But a qualified theme wording does grant: "换个主题风格".
    const qualified = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "current", editableMeta: ["theme"], scopeEvidence: null }), { text: "换个主题风格试试深色商务", pageCount: 4, selectedCount: 0, history: [] });
    assert.deepEqual(qualified.editableMeta, ["theme"]);
});
test("editableMeta survives a scope downgrade and localized evidence enums", () => {
    // The model over-scoped a pure title request to deck — the quote has no
    // deck-range words, so the scope falls back to current but the grounded
    // meta grant must survive (a meta-only lock, not a page edit).
    const downgraded = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", pages: [], structureOnly: false, editableMeta: ["title"], scopeEvidence: { source: "request", quote: "把文稿标题改成季度总结" } }), { text: "把文稿标题改成季度总结", pageCount: 4, selectedCount: 0, history: [] });
    assert.equal(downgraded.scope, "current", "ungrounded deck scope falls back");
    assert.deepEqual(downgraded.editableMeta, ["title"], "the grounded meta grant survives the downgrade");
    // zh-capable models localize the source enum — "请求" is "request".
    const localized = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", pages: [], structureOnly: false, editableMeta: ["title"], scopeEvidence: { source: "请求", quote: "把文稿标题改成季度总结" } }), { text: "把文稿标题改成季度总结", pageCount: 4, selectedCount: 0, history: [] });
    assert.equal(localized.scope, "current");
    assert.deepEqual(localized.editableMeta, ["title"]);
    // A localized continuation enum grounds against historyQuote too.
    const continued = parseAssistantIntent(JSON.stringify({ intent: "edit", scope: "deck", pages: [], scopeEvidence: { source: "延续", quote: "按你刚才的方案执行", historyQuote: "整份文稿换成深色背景" } }), { text: "按你刚才的方案执行", pageCount: 4, selectedCount: 0, history: [{ role: "assistant", at: "t", text: "方案：整份文稿换成深色背景" }] });
    assert.equal(continued.scope, "deck", "a localized continuation enum still grounds against history");
});
//# sourceMappingURL=assistant-intent.test.js.map