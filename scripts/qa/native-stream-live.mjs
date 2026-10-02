#!/usr/bin/env node
// Real-model streaming acceptance, deliberately separate from contract/unit tests.
// Uses only the isolated product endpoints. Never prints credentials or raw reasoning.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launchPinnedChromium } from '../lib/pinned-playwright.mjs';

const root = process.cwd();
const out = path.resolve(root, process.env.STREAM_PROOF_DIR || 'output/native-stream-recovery-2026-09-16');
await fs.mkdir(out, { recursive: true });
const host = 'http://127.0.0.1:13081';
const editor = 'http://127.0.0.1:55201';
async function json(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${data.error || 'request failed'}`);
  return data;
}
const browser = await launchPinnedChromium({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1,
  recordVideo: { dir: out, size: { width: 1440, height: 960 } } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let sid;
let streamAbort;
let collecting;
const started = Date.now();
const report = { startedAt: new Date().toISOString(), model: 'glm-5.3-flash', provider: process.env.STREAM_PROOF_PROVIDER || 'pi-zai-coding-cn', reasoningEffort: 'low',
  network: [], dom: [], reconnects: [], pageErrors: errors };
const latest = new Map();
let socketCount = 0;
async function collect() {
  streamAbort = new AbortController();
  const abort = streamAbort;
  const socket = ++socketCount;
  try {
    const res = await fetch(`${editor}/slides/sessions/${sid}/events`, { signal: abort.signal });
    assert.equal(res.status, 200);
    let pending = '';
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      pending += decoder.decode(chunk, { stream: true });
      let boundary;
      while ((boundary = pending.indexOf('\n\n')) !== -1) {
        const frame = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
        const data = frame.split('\n').find(line => line.startsWith('data: '));
        if (!data) continue;
        const envelope = JSON.parse(data.slice(6));
        assert.equal(envelope.sessionId, sid);
        for (const row of envelope.rows) {
          if (!row.stream) continue;
          const sample = { ms: Date.now() - started, socket, cursor: envelope.cursor, snapshot: !!envelope.snapshot,
            id: row.id, attemptId: row.stream.attemptId, revision: row.stream.revision,
            kind: row.kind, status: row.status, length: (row.detail || '').length };
          report.network.push(sample); latest.set(row.id, sample);
        }
        if (envelope.snapshot) report.reconnects.push({ socket, rows: envelope.rows.length, cursor: envelope.cursor });
      }
    }
  } catch (e) { if (!abort.signal.aborted) throw e; }
}
function growth(samples, kind) {
  const seen = new Map(); let n = 0;
  for (const sample of samples) {
    if (sample.kind !== kind || sample.status !== 'running') continue;
    const key = sample.id;
    const prior = seen.get(key);
    if (prior !== undefined && sample.length > prior) n += 1;
    seen.set(key, sample.length);
  }
  return n;
}
try {
  const health = await json(`${host}/slides/health`);
  assert.equal(health.generateReady, true, 'loaded host must match built source');
  const created = await json(`${host}/slides/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brief: '只做一页封面：星光与引力。中文科普、克制的深蓝排版。制作前先用约150字向我解释设计意图；然后制作封面并检查。',
      provider: report.provider, model: report.model, reasoningEffort: report.reasoningEffort, kind: 'Slides', layout: '16:9' }) });
  sid = created.sessionId;
  report.sessionId = sid; report.projectPath = created.projectPath;
  const url = new URL('/index.html', editor);
  url.search = new URLSearchParams({ project: created.projectPath, workspace: '1', session: sid, live: '1' }).toString();
  report.url = url.href;
  await fs.writeFile(path.join(out, 'live-session.json'), JSON.stringify({ sessionId: sid, projectPath: created.projectPath, url: url.href }, null, 2));
  console.log(JSON.stringify({ sessionId: sid, projectPath: created.projectPath, status: 'real-model-started' }));
  collecting = collect();
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#editor-generation-event-list');
  let firstScreenshot = false; let secondScreenshot = false; let reconnected = false;
  const until = Date.now() + 180_000;
  while (Date.now() < until) {
    const samples = await page.evaluate(() => [...document.querySelectorAll('[data-process-key]')]
      .filter(item => item.dataset.processKind === 'thought' || item.dataset.processKind === 'message')
      .map(item => {
        const detail = item.querySelector('[data-process-detail]');
        const card = item.querySelector('details.reason-card');
        return { id: item.dataset.processKey, kind: item.dataset.processKind === 'thought' ? 'reasoning' : 'message',
          status: item.dataset.processStatus, length: (detail?.textContent || '').length,
          open: card?.open, background: card ? getComputedStyle(card).backgroundColor : undefined,
          border: card ? getComputedStyle(card).borderTopWidth : undefined };
      }));
    for (const sample of samples) {
      const previous = report.dom.findLast(x => x.id === sample.id);
      if (!previous || previous.length !== sample.length || previous.status !== sample.status) report.dom.push({ ms: Date.now() - started, ...sample });
    }
    if (!firstScreenshot && growth(report.dom, 'reasoning') >= 2) {
      await page.screenshot({ path: path.join(out, 'live-reasoning-early.png') }); firstScreenshot = true;
    }
    if (!reconnected && growth(report.network, 'reasoning') >= 6) {
      streamAbort.abort(); await collecting; collecting = collect(); reconnected = true;
    }
    if (!secondScreenshot && growth(report.dom, 'reasoning') >= 12) {
      await page.screenshot({ path: path.join(out, 'live-reasoning-later.png') }); secondScreenshot = true;
    }
    if (growth(report.dom, 'reasoning') >= 12 && growth(report.dom, 'message') >= 5 && reconnected) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  report.growth = { networkReasoning: growth(report.network, 'reasoning'), networkAnswer: growth(report.network, 'message'),
    domReasoning: growth(report.dom, 'reasoning'), domAnswer: growth(report.dom, 'message') };
  assert.ok(report.growth.networkReasoning > 5, 'must receive reasoning growth before block settlement');
  assert.ok(report.growth.domReasoning > 5, 'reasoning DOM must grow before settlement');
  assert.ok(report.growth.domAnswer > 2, 'answer DOM must grow before settlement');
  assert.ok(report.reconnects.some(r => r.socket > 1 && r.rows > 0), 'reconnect must replay a real prefix');
  assert.equal(errors.length, 0);
  await page.screenshot({ path: path.join(out, 'live-product.png') });
  report.accepted = true;
} catch (error) {
  report.accepted = false; report.failure = error.message;
  process.exitCode = 1;
} finally {
  if (sid) {
    // This is a streaming/stop acceptance run, not a finished PPT delivery claim.
    const stopped = await json(`${host}/slides/sessions/${sid}/stop`, { method: 'POST' }).catch(error => ({ error: error.message }));
    report.stop = { ok: stopped.ok, error: stopped.error };
    await new Promise(resolve => setTimeout(resolve, 600));
    report.finalState = await json(`${host}/slides/state/${sid}`).then(s => ({ agentStatus: s.agentStatus, phase: s.phase?.kind, pages: s.project?.pageCount })).catch(error => ({ error: error.message }));
  }
  streamAbort?.abort();
  await collecting?.catch(error => { report.streamError = error.message; });
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(path.join(out, 'real-stream.webm'));
  await browser.close();
  await fs.writeFile(path.join(out, 'stream-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ accepted: report.accepted, failure: report.failure, growth: report.growth, reconnects: report.reconnects, stop: report.stop, finalState: report.finalState }));
}
