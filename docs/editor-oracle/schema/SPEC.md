# Editor oracle — artifact schema (locked)

**Ticket:** OOP-30  
**Supersedes:** ad-hoc notes, empty toolbar stubs without rows

## 1. Repository layout

```text
docs/editor-oracle/
  README.md
  schema/
    SPEC.md                      # this file (normative prose)
    interaction-row.schema.json  # machine schema for row.json
  catalog/
    SURFACE.md                   # enumeration order + checklist (OOP-31)
    index.yaml                   # machine index of all row ids + status
  fixtures/
    manifest.json                # fixture registry
    <fixtureId>/                 # self-contained PPTD project
      deck.pptd                  # or *.pptd
      pages/
      media/
      README.md                  # source (open-kimi example / custom)
  rows/
    <id-with-slashes-as-dirs>/   # id chrome.export.open → rows/chrome/export/open/
      row.json                   # MUST validate against interaction-row.schema.json
      shots/
        before.png
        after.png
        focus.png                # optional
      pptd/
        before/                  # optional full tree snapshot
        after/
        change.diff              # unified diff of text YAML when possible
      export/                    # optional
        before.pptx
        after.pptx
  runs/
    <ISO-date>-<sessionId>/
      log.md                     # free-form capture session notes
```

**Row directory rule:** dotted `id` maps to path under `rows/` by replacing `.` with `/`.  
Example: `element.text.toolbar.bold.toggle` → `rows/element/text/toolbar/bold/toggle/`.

## 2. Per-row fields (summary)

| Field | Required | Meaning |
|-------|----------|---------|
| `id` | yes | Stable dotted id |
| `version` | yes | Integer; bump on semantic change |
| `status` | yes | `discovered` → `capturing` → `specified` → `implemented` → `verified` (+ `blocked` / `wont-port`) |
| `surface` | yes | Bucket from schema enum (chrome / element.* / …) |
| `title` | yes | Short Chinese or English title |
| `preconditions.fixtureId` | yes | Key in `fixtures/manifest.json` |
| `preconditions.selection` | yes | none / page / element / multi |
| `action.steps` | yes | Ordered human-reproducible steps against **official iframe** |
| `evidence.screenshots.before/after` | yes | Dual-channel visual half |
| `evidence.pptd` | strongly expected when doc changes | Diff and/or before/after trees |
| `evidence.export` | when export semantics matter | PPTX before/after or notes |
| `test.id` | yes | `EO-<AREA>-NNN` |
| `oracle.source` | yes | Usually `kimi-iframe` |
| `updatedAt` | yes | ISO-8601 |

**Specified** means at minimum:

1. `shots/before.png` + `shots/after.png` exist and show the control effect (or intentional no-op with explanation).  
2. Either `pptd/change.diff` (or before/after trees) **or** an explicit `evidence.pptd.summary` stating *no document change* (UI-only), justified.  
3. `action.steps` sufficient for a second person/agent to replay on iframe.  
4. `test.id` allocated and listed in `catalog/index.yaml`.

**Verified** means native implementation self-test checklist in `test.selfTestChecklist` all pass without iframe.

## 3. Fixture naming

| Kind | `fixtureId` pattern | Source |
|------|---------------------|--------|
| Open-kimi upstream example | `okp-<name>` | Copied from open-kimi `example/*` (record version/commit in fixture README) |
| Custom capture deck | `cap-<yyyyMMdd>-<slug>` | Built for a specific control family |
| Minimal synthetic | `syn-<purpose>` | Tiny deck for unit rows |

`fixtures/manifest.json` shape:

```json
{
  "fixtures": [
    {
      "id": "okp-dji-pocket4",
      "path": "fixtures/okp-dji-pocket4",
      "source": "open-kimi-ppt-skill/example/dji-pocket4",
      "sourceVersion": "1.2.0",
      "notes": "Multi-page product deck"
    }
  ]
}
```

## 4. Offline / CI use of goldens

| Phase | Network | What runs |
|-------|---------|-----------|
| Capture (until 100%) | Dev may use Kimi iframe anytime | Agents/humans write rows + goldens into this tree |
| Native implement | Optional iframe for compare | Implement only `specified` rows |
| Self-test / handoff | Prefer offline | Replay `test.id` against native; compare to stored shots/diffs **as oracle files**, not live Kimi |
| Airgap production CI | No public net | Only offline goldens; no iframe |

CI later (not required to exist for this decision) should:

1. Validate every `row.json` against `interaction-row.schema.json`.  
2. Fail if any native toolbar control id lacks a row at `specified+`.  
3. Run automated subset where `test.automated: true`.

## 5. Who produces rows

| Producer | When | How |
|----------|------|-----|
| **Agent (primary)** | Default for systematic enumeration | open-kimi `serve` / browser automation + screenshot + PPTD copy; fills `row.json` |
| **Human** | Ambiguous UI, judgment calls | Same artifacts; set `oracle.agent` to person id |
| **Derived** | Batch-generated siblings | `oracle.source: derived` with pointer to parent row |

**Not allowed:** inventing a native button then backfilling a fake row without iframe evidence (unless `wont-port` with reason).

## 6. Status machine

```text
discovered  → seen in iframe catalog pass, no dual evidence yet
capturing   → session in progress
specified   → dual-channel evidence complete; safe to implement
implemented → native code wired; not yet fully self-tested
verified    → self-test pass; counts toward handoff
blocked     → cannot capture (need login, bug, etc.) + blockedReason
wont-port   → explicit decision not to recreate (rare; needs reason)
```

Handoff gate (OOP-29): all rows intended for 1:1 must be `verified` (or explicitly `wont-port`).

## 7. Example row skeleton

See `rows/_examples/element.text.toolbar.bold.toggle/` for a filled template (placeholders only until first real capture).

## 8. Non-goals of this schema

- Storing full official JS bundles  
- Replacing open-kimi PPTD format definition (`pptd.md` remains format SSOT reference)  
- Production packaging of iframe  
