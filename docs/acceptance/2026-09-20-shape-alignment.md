# 细装饰绘制偏移修复 — 2026-09-20

用户截图中蓝色批注框位于深蓝装饰线上方。实际元素是 `cover-rule`，PPTD 坐标 `[120,178,64,6]`。

根因：形状 SVG 采用默认 `display:inline`，参与父元素的文字基线排版。细矩形高度不足一行，导致绘制层向下溢出，批注框仍按正确的元素边界定位。约 46% 缩放的实际页面测得偏移 4.845px，独立回归在 1440 窗口下先复现 13.074px 偏移。此前仅验证了 DOM 容器和选框，缺少 SVG 实际绘制边界的比较。

修复：`.el.shape > svg.shape-paint { display: block; }`，让共享绘制层贴合元素原点。用户原稿和形状坐标未改动。视觉复核还发现播放时画布沿左上角放大导致整页偏移裁切，补充 `.present-slide { transform-origin: center; }`。

验证：

- 原生浏览器点击实际装饰线，SVG/path 与元素的 x/y 偏差为 0；蓝色选框与绘制层的 y 差小于 0.007px（浏览器亚像素舍入）。
- `shape-render-alignment-dom.test.mjs` 先失败、修复后通过：薄矩形、普通矩形、旋转薄矩形在 877/1440/1920 窗口、缩略图、放大、播放和 render 页面共 9 组几何检查，最大绘制偏差为 0。播放整页在屏幕内且中心一致。
- `comment-selection-dom.test.mjs` 通过：批注点击、拖选、范围增减、添加、移除/撤销及刷新仍正常。
- `deck.pptd` 和两份 page 文件前后 SHA-256 完全一致。

[几何结果](../../output/shape-alignment-acceptance-2026-09-20/geometry-results.json)

![修复前](../../output/shape-alignment-acceptance-2026-09-20/native-before.png)
![修复后](../../output/shape-alignment-acceptance-2026-09-20/native-after.png)
![131% 选中细矩形](../../output/shape-alignment-acceptance-2026-09-20/thin-selected-1920.png)
![播放页](../../output/shape-alignment-acceptance-2026-09-20/presentation.png)
