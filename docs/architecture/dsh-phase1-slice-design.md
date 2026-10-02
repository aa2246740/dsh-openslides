# Phase 1 DSH slice design

Arena v2 scored three sketches against the operator plan §12. Candidate 4 dropped out. Base is candidate 1. This file is the grafted sketch the first batch implemented. Phase 1 is closed: Hub create is DSH.

## Pick

`packages/dsh-slides-bundle`, `packages/dsh-slides-host`, `packages/dsh-slides-client`, and `packages/presentation-run` compose a `slides` profile. That profile stacks `@deepseek-ai/dsh-base` and the non-visual rows of `@deepseek-ai/dsh-web-app`, disables official chrome including `ui-layout`, and lets the Open SlideStudio client plugin register the only `root`. Hub `POST /slides/sessions` opens a DSH session plus `PresentationRun`. `POST /api/generate` and `/api/pi/*` return 410.

DSH listens on `127.0.0.1:13080` (the product Hub port — 3080 is DSH.app's default and is rejected; see `dsh-lock.md`). Native-web on `55200` is the raster/editor sidecar, proxied under `/app`, `/api`, and `/media`. Users open one product port.

## Grafts

From candidate 2, a tool-call receipt stores the canonical argument hash. Replay returns the prior outcome only on an exact match. A reused call id with a different hash is a typed conflict.

From candidate 2, root cardinality is checked at registration and on later slot changes. A count other than one is a visible boot error, not a CSS fight.

From candidate 3, `acquireProjectLease` writes `_agent/kernel.lock`. A live Pi owner and a live DSH owner cannot share a project. Stale PIDs may be stolen.

From candidate 3, `decideWritePage` is a pure function. Identical body SHA skips before the write. A `revise` verdict on that SHA is `revise-requires-change`, not a skip.

## Rejects

- Do not keep Hub generate on `createPiBrain`.
- Do not fall back to Gemini.
- Do not classify a brief into a category or design preset.
- Do not put credential-capable `DSH_HOME` inside a slide project. Home is `<repo>/.dsh/home`.

## Named shapes

`DesignDirective` is `self-directed` or `explicit-style`. `SliceRuntimePayload` has no `categoryId` field. `WritePageOutcome` is `written`, `skipped-identical`, `replayed`, `conflict`, `revise-requires-change`, or `rejected`. `SlicePhase` is derived from disk on every inspect.

`PresentationRun.execute` runs domain page tools. It does not import Pi or DSH.

Self-directed `commit_design` does not call the taste gate. It transcribes the agent's `slidePlan` into `recordTodo` so strict `write_page` can run. It does not write a host-chosen design system id.

## Callers

`npm run dsh:profile:init` writes the `slides` profile under `.dsh/home`. `npm run dsh:profile:dump` prints the composed tree. CI diffs it against `packages/dsh-slides-bundle/profile.baseline.yaml`.

`npm start` / `npm run dsh:slides` boots the sidecar plus `dsh --profile slides`. The browser shows Open SlideStudio.

`npm run dsh:smoke` boots, checks unique root health, creates a session, and calls one tool.

`npm run test:recovery` is `scripts/dsh-slides-slice.mjs`. Real MiniMax-M3, one cover, native `#slide` raster, SIGKILL, same session and project, edit without a second page file.

## Pin

`@deepseek-ai/dsh@0.1.5-rc.2`, tag `dsh-v0.1.5-rc.2`, commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`. See `docs/architecture/dsh-lock.md`. Local `dsh-oauth-login` 0.1.9 is dirty and is not a pin.
