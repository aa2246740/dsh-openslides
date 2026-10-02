DSH SlideStudio pin of `@deepseek-ai/dsh-llm-pi-ai` 0.2.0-rc.2.

Rebased onto the kernel-matched release on 2026-09-24: the isolated DSH home
resolves this adapter for every `llm-pi-ai` route, so the pin must track the
running kernel's profile contract (`modelErrors`, `catalogError`, reasoning
descriptors). The earlier 0.1.5 pin predated that contract and crashed inside
`modelOf` once the kernel moved past it.

Vendor patches on top of stock 0.2.0-rc.2, marked `VENDOR:` in `lib/index.js`.
Upstream rc.2 added `normalizeContext`, mid-conversation system/tool
descriptors, and a `mistral-conversations` entry; the three DSH SlideStudio
patches were re-applied on top of that base:

1. `toPiReplayState` — `default: return { type: "text" }` so unknown future
   block kinds keep an index-aligned replay entry instead of dropping it and
   failing the next turn's replay validation.
2. `mapStopReason` — a provider-confirmed `stop` skips usage-vs-catalog
   overflow detection (`isContextOverflow(message, void 0)`). Usage above a
   local estimate must not roll back a completed edit; explicit context
   errors and zero-output `length` still fail.
3. `mapStopReason` — tool-call stop aliases `tool_calls`, `tool_call`,
   `function_call` map to `tool-calls`, and the empty-response check tolerates
   a missing `content` array.

Isolated Host 13081 must resolve this package. Do not patch `node_modules` at
boot. The profile gets it through `@open-slidestudio/oss-oauth-login`'s
`file:` dependency, which installs it at
`profiles/slides/node_modules/@deepseek-ai/dsh-llm-pi-ai` — ahead of the shared
`profiles/node_modules` symlink to the stock package.
