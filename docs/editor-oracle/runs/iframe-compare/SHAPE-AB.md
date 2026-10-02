# Representative OOXML silhouette A/B

**Date:** 2026-08-14  
**Same PPTD:** `fixtures/syn-shapes`  
**Host:** `http://127.0.0.1:55180/?project=syn-shapes`  
**Shot:** `13-syn-shapes-ab.png`

| Preset | Official iframe | Native (pathD) |
|--------|-----------------|----------------|
| rect | filled box | same |
| roundRect | four-corner arcs | four SVG `A` arcs |
| ellipse | oval | SVG `A` |
| triangle | apex-up triangle | same |
| rightArrow | chevron arrow | same (may clip at slide edge) |
| accentBorderCallout1 | body + leader + accent | fill body + stroke leader |

Not claimed: official-iframe 9-page pixel score (compare-host crop/scale). Paths, insert gallery, and adj handles are in the native editor.

## 2026-08-15 — 177 page 1 A/B

**Same PPTD:** `fixtures/syn-shapes-177`  
**Host:** `http://127.0.0.1:55180/?project=syn-shapes-177`  
**Shot:** `26-official-177-ab.png` (official iframe connected)

Page 1 (20 presets) official vs native silhouettes match: rect, roundRect, ellipse, triangle, rtTriangle, parallelogram, trapezoid, diamond, pentagon, hexagon, heptagon, octagon, plus, homePlate, chevron, pie, pieWedge.

Page 5 (`177-p5-synced.png`) after compare host reloads official via single-page `setPPTD`: curved/circular arrows, callouts, cloud match native outlines.

## 2026-08-15 — selection / 177 gallery / animation chrome

Native editor now recreates the official frames that were previously left as “not claimed”:

| Surface | Official evidence | Native |
|---------|-------------------|--------|
| Selection box | frames 12 / 13 / 14 / 32 — dashed `#4c9cff` | `.sel-box` dashed, not solid outline |
| Handles | 8 white squares + rotate circle on a stem | `.handle` 9px white / `.handle-rot` circle + stem |
| Adj diamonds | OOXML `ahLst` | yellow `.handle-adj` still live |
| Smart guides | frame 14 dashed alignment lines | `computeSnapGuides` + `.guide-x/.guide-y` while dragging |
| Ctx toolbar | floats above the selected object; dark on dark slides (33) | `#ctx-bar` anchored to selection; `.is-dark` |
| Chart Edit data | frame 13 spreadsheet, S1 blue header | `#chart-overlay` header + `th.s1` |
| 177 insert | official catalog groups | `#shape-palette` 14-group gallery, all 177 |
| Timeline | tracks + playhead + 单击时 / 同时 / 之后 | chips + stagger 70ms + present-mode groups |

Official iframe 9-page silhouette number (~0.58) is a compare-host crop, not a missing-preset gap. Production still `kimiRuntime: false`.
