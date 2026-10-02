# How official open-kimi-ppt handles material / page-count discipline

Source: vendored `vendor/open-kimi-ppt/skill-1.2.0/skills/open-kimi-ppt/SKILL.md` and `reference/slides_categories/management-report.md`. This is what the **skill text** tells a host agent to do. Official runtime still uses Kimi's public editor + `export_images.py` / `export_pptx.py` — those stay **out of production** here.

## What the official skill does

### Read everything

`step1`: read **all** uploaded files and URLs before designing.

### Page count (SKILL.md step2.4)

| Input | Official rule |
|-------|----------------|
| User names a page count | User wins |
| Page-by-page outline / script | Match that page count |
| Full structured document | **Ask the user** how much document one page should cover, and give an estimated total |
| Topic only | Suggest a count and **confirm with the user** |

Clarification uses the host's ask tool “when available.”

### Expand vs invent

For **Full document** or **Outline**, if the user does not say whether expansion is allowed, the official skill **prefers search to expand** with more material unless the user says not to.

That conflicts with Open SlideStudio law: **no public-web default**, never invent statistics. Our host keeps attachments → optional intranet → gap. We do **not** turn on Gemini `google_search` to pad a 月报.

### Management report category

`management-report.md`:

- Titles state status, not section labels.
- “User-provided numbers and facts are neither exaggerated nor **selectively clipped**; … **anything not in the material is not invented**.”
- Forbid default card grids / equal splits.

There is **no machine check** that every attachment table landed on a page. Coverage is a language rule for the model.

### Visual QA

When the model can see images: run `export_images.py` (official iframe), read the stitched overview, fix, repeat.

When it cannot: structural review only, and **say visual QA was skipped**.

## What the independent harness does / does not

| Official | Open SlideStudio host |
|----------|------------------------|
| Read the selected original skill/spec/category/design material | A checked manifest covers every vendored file. The relevant originals are returned byte-exactly in bounded transport chunks. `write_todo` is locked until the current context epoch has received every required chunk. |
| Ask user for page coverage on a full document | The Hub resolves topic, audience, purpose, and explicit page count before the run. There is still no mid-run ask tool; a genuinely ambiguous full document must fail or use an explicit product policy, not silently compress. |
| Prefer public search to expand | The host does not invent a separate public-search fallback. The selected model may use search it actually exposes; otherwise use attachments, configured intranet research, or an honest gap. |
| Match an explicit script/page count | `write_todo` count, current page revisions, and compose are ledger-bound. Compose is rejected until every planned page exists and passes current evidence gates. |
| Don’t invent / don’t silently clip | Fact and structural gates catch named report gaps and required columns, but there is not yet a general attachment-to-slide semantic coverage proof. This remains separate from page-count enforcement. |
| Official iframe screenshots | Native `#slide` raster only. The PNG is emitted to the model as actual image content with a causal delivery token (vision models); `review_page` is bound to that page revision and raster hash. Deterministic layout diagnostics separately block font, overflow, slide-bound, and footer-zone faults. |
| Always deliver PPTX via official writer | Native hybrid exporter; full-page raster is a failure mode. |

Historical note: the earlier 2026-07 mock report dropped the 三区表、客诉 214、具名责任人 and 8 月拍板 without an omitted list. That run predates the execution ledger and must not be used as current acceptance evidence.
