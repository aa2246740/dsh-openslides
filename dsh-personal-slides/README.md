# dsh-openslides

Open SlideStudio for DeepSeek Harness. Generate, edit and export native editable PowerPoint presentations. Uses the current Harness model catalog and credentials.

## Install

In the Desktop **Plugins → Add plugin** page, paste this prebuilt release URL:

```text
https://github.com/aa2246740/dsh-openslides/releases/download/v0.2.0/dsh-openslides-0.2.0.tgz
```

For the Web profile:

```sh
dsh plugin --profile web add https://github.com/aa2246740/dsh-openslides/releases/download/v0.2.0/dsh-openslides-0.2.0.tgz
```

For registry installation, the npm name and Desktop install field are `dsh-openslides`; the CLI command is `dsh plugin --profile web add dsh-openslides`.

With Personal installed, find **Personal → Slides**. Without Personal, find **Slides** in the official sidebar. Personal is an optional peer. Personal 0.2.8 preserves the editor across space switches and lets Slides temporarily hide it while Host Settings opens.

## Requirements

Tested with Harness 0.2.0-rc.2 and Node ^22.19.0 or >=24.0.0. The package contains built application code, production dependencies and design resources. No install-time build is required.

Rendering requires an existing pinned Playwright 1.61.1 / Chromium Headless Shell 1228 runtime exposing `verifyPinnedRuntime` and `launchPinnedChromium`. The default is `~/.codex/playwright-runtime/runtime.mjs`. Set `SLIDESTUDIO_PLAYWRIGHT_RUNTIME` for another runtime file. This plugin does not install or upgrade the browser. A fresh machine needs that rendering environment before generation; installing the plugin alone does not provide it.

`SLIDES_EDITOR_PORT` changes the local editor sidecar port (default 56200). Projects currently live under the running package or checkout's `output/`; retain that directory before upgrading. Migration from an old installation is manual. Disable the old `dsh-personal-slides` bundle before enabling this package, because both use the same routes.

## Development and release

The historical source directory remains `dsh-personal-slides/`; the published package and client Loader identity are `dsh-openslides`. From the repository root, build changed native packages with `npm run build:native`. Build this wrapper using `pnpm --dir dsh-personal-slides build` against an existing DSHX Harness. Run `node dsh-personal-slides/scripts/release.mjs` to assemble and verify the portable archive outside the checkout.

The bundle follows the [official packaging contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/docs/user/develop/basic/publish.md). See the [repository README](https://github.com/aa2246740/dsh-openslides#readme) and [acceptance evidence](https://github.com/aa2246740/dsh-openslides/blob/main/docs/acceptance/2026-10-02/README.md).
