#!/usr/bin/env node
/**
 * Off-peak Kimi PPT editor capture via WebBridge (dev oracle only).
 * Assumes daemon on 127.0.0.1:10086 and a logged-in browser session.
 *
 * Usage:
 *   node scripts/webbridge-offpeak-capture.mjs
 *   node scripts/webbridge-offpeak-capture.mjs --sleep-until 03:00
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUN = path.join(ROOT, "docs/editor-oracle/runs/webbridge-offpeak");
const BASE = "http://127.0.0.1:10086/command";
const SESSION = "native-oracle-offpeak";
const BRIEF = "错峰oracle：一页标题与要点";

function log(...a) {
  const line = `[offpeak ${new Date().toISOString()}] ${a.map(String).join(" ")}`;
  console.log(line);
  fs.mkdirSync(RUN, { recursive: true });
  fs.appendFileSync(path.join(RUN, "run.log"), line + "\n", "utf8");
}

async function cmd(action, args = {}, timeoutMs = 120_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, args, session: SESSION }),
      signal: ctrl.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSleepUntil(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, min, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return Math.max(0, target.getTime() - now.getTime());
}

function evalData(res) {
  const d = res?.data;
  if (d?.type === "string" && typeof d.value === "string") {
    try {
      return JSON.parse(d.value);
    } catch {
      return d.value;
    }
  }
  if (d?.type === "object") return d.value;
  return d;
}

async function ensureDaemon() {
  try {
    await cmd("list_tabs", {}, 10_000);
    return true;
  } catch {
    log("daemon not reachable — try starting kimi-webbridge");
    return false;
  }
}

async function capture() {
  fs.mkdirSync(RUN, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (!(await ensureDaemon())) {
    fs.writeFileSync(
      path.join(RUN, `result-${stamp}.json`),
      JSON.stringify({ ok: false, reason: "daemon_down", at: new Date().toISOString() }, null, 2),
    );
    return 2;
  }

  await cmd("navigate", {
    url: "https://www.kimi.com/slides",
    newTab: true,
    group_title: "错峰 oracle 采集",
  });
  await sleep(4000);

  const state0 = evalData(
    await cmd("evaluate", {
      code: `(() => JSON.stringify({
        url: location.href,
        title: document.title,
        hasLogin: /微信扫码|手机号快捷登录/.test(document.body.innerText) ||
          [...document.querySelectorAll('button')].some(b => (b.innerText||'').trim()==='登录'),
        userHint: (document.body.innerText.match(/吴\\S{0,4}|升级套餐/)||[])[0] || null,
        t: document.body.innerText.replace(/\\s+/g,' ').slice(0,400)
      }))()`,
    }),
  );
  log("state0", JSON.stringify(state0));
  await cmd("screenshot", {
    path: path.join(RUN, `01-hub-${stamp}.png`),
    format: "png",
  });

  if (state0?.hasLogin) {
    const result = {
      ok: false,
      reason: "not_logged_in",
      state0,
      at: new Date().toISOString(),
      note: "Keep browser logged into Kimi before 03:00",
    };
    fs.writeFileSync(path.join(RUN, `result-${stamp}.json`), JSON.stringify(result, null, 2));
    log("FAIL not logged in");
    return 3;
  }

  // Prefer K3 for PPT path
  await cmd("evaluate", {
    code: `document.querySelector('.current-model')?.click(); 'ok'`,
  });
  await sleep(1000);
  await cmd("evaluate", {
    code: `(() => {
      const items = [...document.querySelectorAll('.model-item')];
      const k3 = items.find(el => {
        const t = el.innerText || '';
        return t.includes('K3') && !t.includes('集群');
      });
      if (k3) { k3.click(); return 'k3'; }
      return 'no-k3';
    })()`,
  });
  await sleep(800);

  await cmd("fill", {
    selector: "[contenteditable=true]",
    value: BRIEF,
  });
  await sleep(500);
  await cmd("click", { selector: ".send-button-container" });
  await sleep(6000);

  let outcome = {
    ok: false,
    reason: "unknown",
    url: null,
    hasQueue: false,
    hasExport: false,
    hasEditor: false,
  };

  for (let i = 0; i < 36; i++) {
    // up to ~3 min
    const st = evalData(
      await cmd("evaluate", {
        code: `(() => {
          const t = document.body.innerText.replace(/\\s+/g,' ');
          return JSON.stringify({
            url: location.href,
            title: document.title,
            hasQueue: t.includes('优先队列') || t.includes('订阅会员可进入'),
            hasExport: t.includes('导出'),
            hasEditor: t.includes('导出') || !!document.querySelector('[class*=slide-editor],[class*=canvas-container],canvas'),
            snippet: t.slice(0, 320)
          });
        })()`,
      }),
    );
    log(`poll[${i}]`, JSON.stringify(st));
    outcome = {
      ok: Boolean(st?.hasExport || st?.hasEditor || (st?.url && st.url.includes("/slides/") && st.url !== "https://www.kimi.com/slides")),
      reason: st?.hasQueue
        ? "queue_blocked"
        : st?.url?.includes("/chat/")
          ? "fell_to_chat"
          : st?.hasExport || st?.hasEditor
            ? "editor_open"
            : "waiting",
      ...st,
    };
    if (st?.hasQueue) {
      await cmd("screenshot", {
        path: path.join(RUN, `02-queue-${stamp}.png`),
        format: "png",
      });
      await cmd("evaluate", {
        code: `[...document.querySelectorAll('button')].find(b=>(b.innerText||'').includes('我知道了'))?.click();'d'`,
      });
      break;
    }
    if (outcome.ok) {
      await cmd("screenshot", {
        path: path.join(RUN, `02-editor-${stamp}.png`),
        format: "png",
      });
      // catalog chrome buttons once in editor
      const chrome = evalData(
        await cmd("evaluate", {
          code: `(() => {
            const labels = [...document.querySelectorAll('button,a,[role=button]')]
              .map(el => (el.innerText||el.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' '))
              .filter(t => t && t.length < 24);
            return JSON.stringify([...new Set(labels)].slice(0, 80));
          })()`,
        }),
      );
      outcome.chromeLabels = chrome;
      break;
    }
    await sleep(5000);
  }

  if (!outcome.ok && outcome.reason === "waiting") {
    await cmd("screenshot", {
      path: path.join(RUN, `02-timeout-${stamp}.png`),
      format: "png",
    });
    outcome.reason = "timeout_no_editor";
  }

  const result = {
    ...outcome,
    brief: BRIEF,
    at: new Date().toISOString(),
    session: SESSION,
  };
  fs.writeFileSync(path.join(RUN, `result-${stamp}.json`), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(RUN, "latest-result.json"), JSON.stringify(result, null, 2));

  // Append to report
  const reportPath = path.join(RUN, "REPORT.md");
  const line = `\n## Run ${result.at}\n\n- ok: **${result.ok}**\n- reason: \`${result.reason}\`\n- url: ${result.url || "n/a"}\n\n`;
  fs.appendFileSync(
    reportPath,
    fs.existsSync(reportPath) ? line : `# WebBridge off-peak capture\n${line}`,
    "utf8",
  );

  log("DONE", JSON.stringify(result));
  return result.ok ? 0 : 1;
}

const args = process.argv.slice(2);
let sleepUntil = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--sleep-until" && args[i + 1]) sleepUntil = args[++i];
}

const waitMs = sleepUntil ? parseSleepUntil(sleepUntil) : 0;
if (waitMs > 0) {
  log(`sleeping until ${sleepUntil} (${Math.round(waitMs / 1000)}s ≈ ${(waitMs / 3600000).toFixed(2)}h)`);
  // chunked sleep so process stays responsive in logs
  const chunk = 60_000;
  let left = waitMs;
  while (left > 0) {
    const n = Math.min(chunk, left);
    await sleep(n);
    left -= n;
    if (left > 0 && left % (30 * 60_000) < chunk) {
      log(`still waiting, ~${(left / 3600000).toFixed(2)}h left`);
    }
  }
  log("wake — starting capture");
}

const code = await capture();
process.exit(code);
