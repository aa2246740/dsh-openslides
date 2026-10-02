# DSH lock

| Field | Value |
| --- | --- |
| npm package | `@deepseek-ai/dsh` |
| version | `0.1.5-rc.2` (exact, per `package.json` + installed tree) |
| git tag | `dsh-v0.1.5-rc.2` (verified via `git ls-remote` of `github.com/deepseek-ai/deepseek-harness`) |
| commit | `fb2c4b9e698e30edb738bca4cf0618587db7d203` (upstream tag `dsh-v0.1.5-rc.2`; the npm tarball ships no `gitHead`) |
| registry tarball | `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.5-rc.2.tgz` |
| tarball integrity (sha512, `package-lock.json`) | `sha512-8Xc8hCQHcIWRmTCVU/xZdp6/qMsWMeAd2ObChKDEsfhUPJFXx6H0lgeb1DxUMD86HZrrVN+1bCvn1ppjZ/fOxw==` |
| web dump-config (historical rc.2 snapshot) | `docs/architecture/dsh-rc2-web-dump-config.yml` |
| slides dump-config | `packages/dsh-slides-bundle/profile.baseline.yaml` |

`dsh-oauth-login` npm 0.1.9 exists. The local checkout of that package is dirty. Do not pin a dirty worktree. Phase 4/5 re-verifies a published OAuth plugin against the current DSH pin.

`DSH_HOME` for this repository is `<repo>/.dsh/home`. It must never be `~/.dsh`. Hub listens on **13080**, not DSH.app's default 3080. Startup copies API-key providers from `~/.dsh/settings.yaml` into the isolated home and drops Antigravity. It does not copy `.dsh-oauth-auth.json`, `.pi-login-auth.json`, or `.dsh-antigravity-oauth.json`. Refreshing those grants from a shared file would kick the local DSH App off its session.

Generate uses the imported default (AMD `DeepSeek-V4-Flash` when that key exists and the App default was Antigravity). Hub may select any imported API-key model. 429 / rate-limit / MiniMax token-plan 2056 pause the same session and wait. Do not mark complete. Do not mint a new session.

They never copy the secret into dumps, session jsonl, tool results, a PPTD project, logs, screenshots, or the PR.

The `slides` profile file dependencies are dsh-slides-bundle/host/client, presentation-run, pptd-v2, project-store, exporter-native. `@open-slidestudio/agent-harness` is the Phase 0 freeze and fixture package. It is not a production profile dependency.

Credentials stay in `<repo>/.dsh/home`, not under `output/dsh-slices/`.

`npm start` / `npm run dsh:slides` syncs workspace `dist` into `.dsh/home/profiles/slides/node_modules` before spawn. Hub `POST /slides/sessions` and `/turn` refuse generate (`503 stale_produce_gates`) if the loaded host dist fails the seven-gate fingerprint (`pageHasVisibleContent`, empty leftover closer, persist-by-id, empty cells, bounds, review_page, compose no-skip) or if that copy’s hash does not match workspace. `dsh:profile:init` is not a manual afterthought. When `vision===none`, `compose_deck` / `requireComposeReady` seal on structural `write_page`, layout-qa, and leftover-closer; they do not require a visual `review_page` pass and they do not accept MiniMax `verdict=pass`. A configured vision reviewer still needs an image-backed pass. Never Antigravity.

`dsh-session-persistence-jsonl` imports `createZstdDecompress` from `node:zlib`. That export exists on Node `>=22.19`. Repo engines already require that. `scripts/lib/dsh-runtime.mjs` prepends a Node binary that has zstd when the current process is older.
