# dsh-personal-slides

Open SlideStudio for DeepSeek Harness 0.2.0-rc.2. With `dsh-personal`, Slides
registers in Personal. Without it, Slides registers its own sidebar panel.
Personal is an optional peer, including in the client dependency graph.

Development uses the adjacent repository packages and resources. Run
`node scripts/release.mjs` to assemble and verify a portable plugin tarball.
The tarball bundles application dependencies and resources; the pinned browser
runtime remains separately managed (Playwright 1.61.1 / Chromium shell 1228).
Set `SLIDESTUDIO_PLAYWRIGHT_RUNTIME` when it is outside the default
`~/.codex/playwright-runtime/runtime.mjs` location. The packaging script does not
install or upgrade that runtime. Passing artifact checks does not automatically
publish a release.

From the repository root:

```sh
npm ci
# Rebuild changed workspace packages if developing:
npm run build:native
```

For changes to this wrapper, install its development dependencies with pnpm,
then build against the configured DSHX Harness:

```sh
cd dsh-personal-slides
pnpm install --ignore-workspace
pnpm build
```

The build uses DSHX `externalClientBundle` for the lazy-CJS client handoff.
Install the package directory through the active profile's plugin manager or
`dshx plugin add /absolute/path/to/dsh-personal-slides --profile desktop --port <host-port>`.
The `dsh.bundle` manifest activates `cordis.patch.yml`; do not also insert the
same plugin through another patch. A file-only server mount does not install
the client package graph.

Hosted model selection uses the Harness `llm` service. Configure custom model
APIs in Harness settings; no `slides-model-catalog.json` export or duplicate
API-key store is required. Adapter registration establishes availability;
actual authentication is checked by that adapter when a request runs.

Resources resolve from this checkout, independently of the launch directory.
`SLIDESTUDIO_SKILL_ROOT` optionally overrides the design-resource directory;
`SLIDES_EDITOR_PORT` overrides the editor sidecar port (default `56200`).
