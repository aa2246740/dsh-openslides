# dsh-personal-slides

Scratch plugin. Check it through the configured Harness checkout with:

```sh
dshx check dsh-personal-slides
dshx verify-boot dsh-personal-slides
dshx start web dsh-personal-slides
```

Install this out-of-tree package independently, then build the Host and browser halves:

```sh
pnpm install --ignore-workspace
pnpm build
```

The generated `tsdown.config.ts` uses dshx `externalClientBundle`; RC8's
repository-internal `packages/client/tsdown.client.ts` rejects `my-plugins/*`.
`dshx check` stays red until `lib/client.js` contains the lazy-CJS handoff.

Read the dshx knowledge bundle before changing the contract.
