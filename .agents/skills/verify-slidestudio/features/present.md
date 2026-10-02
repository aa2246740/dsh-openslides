# Play mode

`#btn-play` opens `#present` (body gets `is-presenting`). Arrow keys move, Esc leaves. Driver id
`present` (`drivers/editor-core.mjs`).

## What the driver proves

Entering sends the `present` command and paints `#present-slide`; two ArrowRight presses change the
slide, ArrowLeft goes back, Esc leaves play mode; the project on disk is untouched. The fullscreen
control (`[data-control="chrome.present.fullscreen"]`, `#btn-fs`) exists and clicking it does not throw.

## Gotchas

- OS fullscreen is not asserted: headless Chromium may reject `requestFullscreen` and the product
  toasts. It is a stated non-goal of the product contract.
- `#present-slide` is re-rendered per page; compare its `innerHTML`, not a screenshot hash.
- The play view scales from the centre; screenshots should show the whole page inside the screen.
