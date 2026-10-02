DSH SlideStudio pin of `dsh-oauth-login` 0.2.7.

Taken from `aa2246740/dsh-oauth-login` `main`, commit
`1b64aa82b6e6304cae3bae10aab5766a278f2e7c`. The vendor tree is a `file:`
snapshot of its runtime build, not an npm release.

The vendor keeps only the runtime surface (`lib/`, docs, `cordis.patch.yml`,
`package.json`). `devDependencies`, `scripts`, `src/`, and `tests/` stay in the
upstream repo. Peer ranges follow that commit: `@deepseek-ai/dsh` and
`@deepseek-ai/dsh-client-connection` are `>=0.2.0-rc.2 <0.2.1`, and every peer
is optional. `lib/` now includes the upstream `normalizeContext` /
mid-conversation tool filtering changes for DSH 0.2.0-rc.2.

Both earlier DSH SlideStudio patches are now upstream behavior in this build,
so `lib/index.js` is unmodified:

1. `createPiLoginAdapter` already sets `modelErrors: new Map()` on each route.
2. `filterHostedServerToolTraces` already omits `replayState` when the source
   chunk has none.
