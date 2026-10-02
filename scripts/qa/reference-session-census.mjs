import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const output = path.resolve(process.argv[2] || "output/reference-root-cause-2026-09-15");
const sessionIds = process.argv.slice(3);
if (!sessionIds.length) throw new Error("Pass an output directory and explicit session IDs");
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const sha = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const count = (values) => Object.fromEntries([...new Set(values)].sort().map((v) => [v, values.filter((x) => x === v).length]));
const summary = [];
for (const sid of sessionIds) {
  if (!/^[a-f0-9-]{36}$/.test(sid)) throw new Error("Invalid session id");
  const file = path.join(root, ".dsh/home-editor-qa/sessions/--Users-wu-Documents-DSH-output-openslides--", sid, "session.jsonl.zstd");
  const bytes = fs.readFileSync(file);
  const text = execFileSync("zstd", ["-dc", file], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const events = text.trim().split("\n").map(JSON.parse);
  const dir = path.join(output, sid.slice(0, 8));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const snapshot = path.join(dir, "captured.session.jsonl.zstd");
  if (!fs.existsSync(snapshot)) fs.writeFileSync(snapshot, bytes, { mode: 0o600, flag: "wx" });
  const requests = events.filter((e) => e.type === "request/header").map((e) => {
    const h = e.data.header;
    const tools = h.tools || [];
    const selected = tools.find((t) => t.name === "write_page");
    const schema = selected?.parameters;
    return {
      seq: e.seq, time: e.time,
      provider: h.config.provider, model: h.config.model, reasoningEffort: h.config.reasoningEffort,
      systemSha256: sha(h.system || ""),
      tools: tools.map((t) => ({ name: t.name, parametersSha256: sha(t.parameters || {}) })),
      writePageSchema: schema,
      writePageDescription: selected?.description,
    };
  });
  const calls = events.filter((e) => e.type === "tool/call").map((e) => {
    const d = e.data;
    let args;
    try { args = JSON.parse(d.arguments); } catch { args = null; }
    return {
      seq: e.seq, time: e.time, turn: d.turn, step: d.step, callId: d.callId, name: d.name,
      argumentsBytes: Buffer.byteLength(d.arguments || ""), argumentsSha256: sha(d.arguments || ""),
      keys: args && typeof args === "object" ? Object.keys(args) : [],
      elements: Array.isArray(args?.elements) ? args.elements.length : null,
      envelopeDepth: (() => { let n = 0, a = args; while (a && typeof a === "object" && Object.keys(a).length === 1 && "arguments" in a) { a = a.arguments; n += 1; if (n > 32) break; } return n; })(),
    };
  });
  const results = events.filter((e) => e.type === "tool/result").map((e) => {
    const d = e.data;
    const block = d.message.content?.find((b) => b.type === "tool-result");
    const texts = (block?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    let payload;
    try { payload = JSON.parse(texts); } catch { payload = null; }
    return { seq: e.seq, turn: d.turn, step: d.step, callId: block?.toolCallId, code: d.error?.code,
      isError: !!d.error || block?.isError === true,
      errorText: !!d.error || block?.isError === true ? texts.slice(0, 500) : undefined,
      outcome: payload?.outcome, ok: payload?.ok,
      name: calls.find((c) => c.callId === block?.toolCallId)?.name,
      imageCount: (block?.content || []).filter((b) => b.type === "image").length,
    };
  });
  const messages = events.filter((e) => e.type === "assistant/message").map((e) => {
    const d = e.data, blocks = d.message?.content || [];
    const tc = blocks.filter((b) => b.type === "tool-call");
    return { seq: e.seq, turn: d.turn, step: d.step, usage: d.usage,
      blockTypes: count(blocks.map((b) => b.type)),
      toolCallCount: tc.length, uniqueCallIds: new Set(tc.map((b) => b.id)).size,
      calls: count(tc.map((b) => b.name)), argumentPatterns: count(tc.map((b) => sha(b.arguments || ""))),
    };
  });
  const turns = events.filter((e) => e.type === "turn/end").map((e) => ({ seq: e.seq, time: e.time, ...e.data }));
  const data = { sessionId: sid, capturedAt: new Date().toISOString(), sourceHash: sha(bytes),
    eventCount: events.length, eventTypes: count(events.map((e) => e.type)), requests, calls, results, messages, turns };
  fs.writeFileSync(path.join(dir, "census.json"), JSON.stringify(data, null, 2) + "\n");
  summary.push({ sessionId: sid, eventCount: events.length,
    requestHeaders: requests.map(({ writePageSchema, writePageDescription, ...request }) => ({ ...request, writePageSchemaHash: sha(writePageSchema || {}) })),
    firstTurnCalls: count(calls.filter((c) => c.turn === 1).map((c) => c.name)),
    firstTurnWrite: count(calls.filter((c) => c.turn === 1 && c.name === "write_page").map((c) => c.elements === null ? "missing" : String(c.elements))),
    messages: messages.map(({ argumentPatterns, ...m }) => ({ ...m, uniqueArguments: Object.keys(argumentPatterns).length })),
    turns,
  });
}
fs.writeFileSync(path.join(output, "census-summary.json"), JSON.stringify(summary, null, 2) + "\n");
for (const c of summary) console.log(JSON.stringify({ sessionId: c.sessionId, firstTurnCalls: c.firstTurnCalls, firstTurnWrite: c.firstTurnWrite, schema: c.requestHeaders.map((h) => h.writePageSchemaHash), largestBatch: Math.max(...c.messages.map((m) => m.toolCallCount)), turns: c.turns.map((t) => t.reason?.kind) }));
