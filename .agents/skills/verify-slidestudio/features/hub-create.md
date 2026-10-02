# Create Hub

The first screen: wordmark, one prompt card, the recent-work list. Driver id `hub-create`
(`drivers/hub.mjs`). Reached at `<base>/` (also `/hub`).

## What a user does

- Types a brief in `#brief`. `#btn-send` stays disabled for an empty or whitespace-only prompt and
  enables once the style catalog (`/slides/catalog`) has loaded and a usable model is selected.
- `#btn-layout` opens `#layout-menu`: 自适应 is disabled with a reason (`data-tip`), 16:9 and 4:3 are
  choices; the label `#layout-label` follows. A click elsewhere closes the menu.
- `#style-chip` (a `role=button`, keyboard operable) opens `#style-pop` with 自由风格 plus the
  catalog styles and category tabs; a second click, ✕ (`#btn-style-pop-close`) or picking a card closes
  it; the chip is renamed.
- `#btn-attach` opens `#attach-modal` (Esc closes). `#btn-demo-ref` adds the local demo references,
  `#attach-file` uploads a file; each shows as `.reference-chip.is-parsed` in `#attach-row` with ×.
  Send is disabled while any chip is not parsed.
- `#btn-model` opens an anchored `#pi-panel` popup without expanding the prompt. `#pi-model`
  is a provider-grouped listbox from `/slides/models`; options carry `data-model-key="providerId/modelId"`.
  Picking closes it. Supported thinking efforts are radios in `#pi-effort`, followed by four compact
  capability indicators. Esc returns focus to the trigger; outside click and Tab leaving close it.
  Login stays in Settings. The choice is stored in `localStorage` (`oss.pi.provider`, `oss.pi.model`).

## What the driver proves

Gating, both menus, style panel (mouse and keyboard), attachment add/remove/gating (files under
`output/attachments/` created by the run are removed), model panel contents and persistence, the jump to
Settings, and at 375px no sideways scroll with Send on screen. Screenshots: `01-hub` … `05-narrow`.

## Gotchas

- The fake kernel declares vision and native search available; the strip lights those two,
  with image search/generation dimmed. This proves rendering, not provider capability.
- `#btn-kind` (output type) is `hidden`: only slides exist. Docs/Report entries are disabled.
- The bogus-PNG upload makes the server answer 415; the feature lists it in `ignoreErrors`.
- Send does not generate here. It navigates away; see `hub-launch.md`.
