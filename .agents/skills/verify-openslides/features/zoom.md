# Zoom

`#btn-zoom-in`, `#btn-zoom-out` and the clickable `#zoom-label`. Driver id `zoom`
(`drivers/editor-core.mjs`).

## What a user sees

- The label shows the current scale relative to the design size: it starts at the **fit** value (for
  example 64%), not 100%.
- Each step is a `zoom` command. Zoom-in grows by 10% of fit per click; zoom-out stops at a floor
  (about 25% of fit, or 12%). Clicking `#zoom-label` returns to fit. Zoom is view state: nothing is
  written to the project.

## What the driver proves

Label starts at fit, three zoom-ins grow it by ~30%, the slide card widens, zoom-out clamps, the label
click restores fit, and the project on disk is byte-identical afterwards.

## Gotchas

- Compare with `fit`, never with a fixed 100%: the fit depends on the viewport.
- Wait for each `zoom` command before reading the label.
