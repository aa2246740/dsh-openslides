# Handoff — Open SlideStudio (`kimi-slides`)

> **Superseded (Pi era).** Dated 2026-08-20, written while Pi RPC was the
> production kernel and `/api/generate` was live. The production kernel is now
> DSH (`docs/adr/0009`): Hub generate is `POST /slides/sessions`, `/api/generate`
> and `/api/pi/*` return 410, and `createPiBrain`/`runPiHand` are freeze fixtures
> in `@open-slidestudio/agent-harness`. Keep this file as a historical record;
> do not treat its Pi endpoints and ports as current instructions.

**For:** a fresh agent continuing native generate / monthly-report QA.
**Repo:** `/Users/wu/orca/projects/kimi-slides`
**Branch:** `main` @ `8243efa` (many **uncommitted** harness + Hub changes on top)
**Product name:** Open SlideStudio. YAML PPTD v2 is disk SSOT. No Kimi iframe/CDN in production.

Do **not** treat this file as instructions to invent APIs. Read the paths below.

---

## What the last session actually did

The human was **not** asking the agent to draw slides. Product generate is:

1. Agent (or human) `POST http://127.0.0.1:55200/api/generate` with `{ brief, model: "Pi", stream: true }`
2. Hub (`apps/native-web/src/server.mjs`) starts Pi `--mode rpc` + grok-4.5 / xai-auth
3. **Pi** is director: `write_todo` → `write_page` per page → `render_page` (native `#slide`) → `review_pages` → `compose_deck`
4. Host is harness only: Hub, login, hands tools, export. Host must **not** restamp, paint, salvage-compose, or convert `bg` shape into page-level `background`

The previous agent: POSTed generates, **changed harness gates**, collected evidence dirs, exported pptx via `/api/open` + `/api/export`. It did **not** write the monthly-report YAML by hand.

Hub: do **not** restart on 137/SIGTERM if `127.0.0.1:55200` is HTTP 200. Restart **only** after `packages/agent-harness/dist` actually changed (Node ESM cache). Never restart as a status ritual.

---

## Source map (native path — prefer this)

| Path | Role |
|------|------|
| `packages/pptd-v2` | YAML PPTD v2 parse/serialize (disk SSOT) |
| `packages/project-store` | versions on PPTD dirs |
| `packages/exporter-native` | offline hybrid PPTX |
| `packages/canvas-session` | session + dead-button gate |
| `packages/agent-harness` | generate tools, Pi RPC, playbook, QA |
| `apps/native-web` | Hub + native editor (PORT 55200) |
| `packages/agent-harness/skills/open-slidestudio/` | **host skill pack** Pi should follow (`SKILL.md` + `handbook.md` `pptd-write.md` `classroom.md` …) |
| `vendor/open-kimi-ppt/` | discovery only; do not treat as produce SSOT |
| `docs/architecture/agent-runtime.md` | generate runtime |
| `docs/architecture/independent-harness.md` | **untracked** — independent harness notes |
| `CONTEXT.md`, `docs/adr/`, `Agents.md` | product law |

**Do not extend as SSOT:** `packages/pptd`, `packages/agent-core`, `apps/web`, Kimi iframe.

---

## Produce-path source to read first

These files are the live generate contract (uncommitted edits in this working tree):

| File | Why |
|------|-----|
| `packages/agent-harness/src/pi-brain.ts` | Pi session, **no salvage-compose**, fail if stack incomplete, no-data throw before session |
| `packages/agent-harness/src/agent-tools.ts` | `write_page` persist as-is (`painted/restamped false`); `compose_deck` blocks `unnamed_gap` / `missing_column` |
| `packages/agent-harness/src/report-facts.ts` | **new** — 月报 needs company name + numbers; named gaps; dense table must have **exact header cells** including `负责人` |
| `packages/agent-harness/src/skill-pages.ts` | `parseSkillPage`; do **not** steal full-bleed `bg` into `page.background` |
| `packages/agent-harness/src/layout-qa.ts` | courseware QA + `unnamed_gap` / `missing_column` codes |
| `packages/agent-harness/src/playbook.ts` | host contract text Pi sees in `playbook.md` |
| `packages/agent-harness/src/index.ts` | `runGenerateAsync`; pause `diskReady` = `usedPi && skillStack.ok` only (not “≥2 pages on disk”) |
| `packages/agent-harness/src/pi-hands.ts` | hands-log, skill stack evidence merge |
| `apps/native-web/src/server.mjs` | `POST /api/generate` `model=Pi`; Hub default design remap |
| `packages/agent-harness/skills/open-slidestudio/SKILL.md` | refuse 月报 with no company/numbers; `示意` still fabricating |

**Removed from produce path:** `salvageWrittenDeck` / `salvageClassroomDeck` / `pi-tools-salvage` / `salvage-compose` event. Incomplete Pi (`write_page` then `stop:error`) must **fail**, not host-finish the pptx.

`host-produce.ts` / `exhibit-paint.ts` / `finishScriptedPages` exist for **offline tests only**. Product generate must not call them after `agent_end`.

---

## Uncommitted work (this tree)

`git status` is dirty on `packages/agent-harness/**` and Hub chrome. New files include:

- `packages/agent-harness/src/report-facts.ts` + `report-facts.test.ts`
- skill extras: `handbook.md`, `pptd-write.md`, `classroom.md`, `qa.md`, `scenario.md`, `images.md`
- host-produce / exhibit-paint / produce-qa (test painter, not Hub generate)

Harness tests were last green at **236 pass** (`cd packages/agent-harness && npm test`). After code change, rebuild dist (`tsc`) **then** Hub must be restarted **once** so `import(dist/index.js)` is not stale.

---

## How generate is invoked

```http
POST http://127.0.0.1:55200/api/generate
Content-Type: application/json

{ "brief": "...", "model": "Pi", "stream": true }
```

Pi env (already used): `SLIDESTUDIO_PI_PROVIDER=xai-auth` `SLIDESTUDIO_PI_MODEL=grok-4.5` `SLIDESTUDIO_PI_TIMEOUT_MS=900000` plus local proxy `127.0.0.1:45678` when needed. Auth: `~/.pi/agent/auth.json` xai-auth (sync from `~/.grok/auth.json` if stale).

Export: `POST /api/open` `{ path }` then `POST /api/export` `{ format: "pptx" }`.

Evidence lives under `output/` — **do not cite older seed dirs** if the user forbade them. Current monthly QA dirs:

| Case | Dir | Last known result |
|------|-----|-------------------|
| A 星河零售 7月正常月报 | `output/qa-monthly-a-xinghe-202607/` | **pass** — do **not** overwrite |
| B 缺数 | `output/qa-monthly-b-missing-2/` | **pass** — Pi 7 pages, `produce=pi-tools`, gaps named `华南客单价/复购/线下毛利` + `缺失，待补`, no salvage |
| C 12×8 密表 | `output/qa-monthly-c-dense-2/` | **pass** (after QA retries) — one table header cells include `负责人`; 刘洋/陈凯 in **负责人 column**; bounds inside 960×540 |
| D 无数据 | `output/qa-monthly-d-nodata-2/` | **pass** — refuse in ~30ms, `usedPi=false`, no pptx, empty shell page text `生成中`, no 94%/940/示意公司 |

Latest C project (this tree): `output/hub-1787210426716-根据下面数据做一份-星河零售-2026年7月经营`
Latest B project: `output/hub-1787208617321-根据下面数据做一份-星河零售-2026年7月经营`

Pi clock is reconstructed from `_agent/hands-log.jsonl` + `_agent/pi-trace.json` (no automatic `pi-clock.json` on produce). `hands-log` **truncates args at 1500 chars** — use `hands-state.json` for full pages.

---

## Product / QA law the human already set

- YAML PPTD v2 only; no dual IR; no official Kimi iframe in prod.
- Host director = fail. `ensureOfficialRecipePage` / restamp / paint remaining pages / salvage-compose = fail.
- Disk must match `write_page` args (ids; `bg` stays a shape; no page-level `background` stolen from `bg`).
- Classroom playbook is for **teach** briefs. Monthly report is `management-report` + `work/warm-jade-annual-report` (intent `report` via `月报` in `compose-ir.ts`).
- `示意` / `演示占位` KPI on a brief with **no company and no numbers** is still 撸数 (D).
- Named gaps must appear **as those words** plus `缺失，待补`, not “三项数据标缺失”.
- Dense SKU table: **exact header cell** `负责人` on the **largest ≥10-row table**, owner names in that column — substring mash (`品名…负责人` in one cell, `晨光纯奶刘洋`) is cheating and must fail QA (`report-facts.ts`).
- Failed `compose_deck` still currently counts as `tool:compose_deck` in skill-stack events — be honest if generate `ok=true` while last compose was `ok=false`.

---

## Open / next (not done)

- Working tree not committed. Human did not ask for a PR.
- Hub POST generate still may not paint a Hub result card (`homeHidden`); editor chrome / project screenshots used as product surface.
- `wrap:true` may still be added on text YAML vs agent args (id-level equality was the gate).
- C generate can loop a long time if Pi keeps failing table QA then rewriting `page-03`/`page-04`.
- D still creates `createEmptyProject` placeholder `1_cover.page` (“生成中”) — refuse is the pass, not 0 files.
- Do not restart Hub for 137 noise. Do not “confirm Hub” as a delivery.

---

## Suggested skills

- **handoff** — this document
- **orca-cli** — only if handing to another Orca worktree (`orca worktree create --no-parent --agent …`)
- **code-review** / **review** — if asked to review uncommitted harness vs “host must not direct”
- **tdd** — if extending `report-facts.ts` / produce gates
- **diagnosing-bugs** — if generate `ok=true` with failed compose or salvage regressions
- Do **not** load Bilibili Toy / 小红书 minitool rules (out of scope)
- Do **not** use Vizual HTML-PPT skills for this product; native PPTD + exporter-native only

---

## How the next agent should start

1. Read `Agents.md`, `CONTEXT.md`, `docs/architecture/independent-harness.md`, then the produce files listed above.
2. `git status` / `git diff packages/agent-harness` — all generate-path work is uncommitted.
3. If changing harness: `cd packages/agent-harness && npm test`, then one Hub restart **only if dist changed**.
4. New monthly cases: `POST /api/generate` `model=Pi`, new `output/qa-…` dir, paste **text** verification (ls, pptx path+bytes, Pi clock, ids, Hub HTTP, numbers). Do not tell the human to “go read the disk”.
5. Do not overwrite `output/qa-monthly-a-xinghe-202607/`.
