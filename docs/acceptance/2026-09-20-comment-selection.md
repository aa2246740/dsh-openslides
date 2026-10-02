# 批注模式选区残留修复

用户路径：选中页面标题 → 打开批注 → 点击另一个对象。旧行为只更新批注目标，标题仍保留编辑选框与旋转手柄。

进入批注模式现在先继承原选区作为批注目标，再通过已有 select 命令清空编辑选区；等待命令期间立即移除编辑手柄。点击已保存批注通过批注高亮定位，不再调用编辑选中。重新绑定批注使用当前批注目标。批注模式的 Tab 保留原生焦点导航，不再触发画布对象选择。

原生浏览器按上述路径实测：目标为“穿舒适鞋子”，编辑选区 0、编辑手柄 0，原有“用红色的字”批注保留。没有执行 AI 修改或修改文稿内容。

![修复后的批注界面](assets/2026-09-20-collaboration/comment-selection-fixed.png)

固定 Chromium DOM 回归覆盖：原选区转入批注、换目标、Shift 多选、Tab 导航、保存批注和点击定位、退出后重新编辑，以及文稿文件逐字节不变。加上目标命中测试，共 5 项通过。

```sh
node --test apps/native-web/src/comment-selection-dom.test.mjs apps/native-web/src/comment-targets.test.mjs
```

源码为 `apps/native-web/public/app.js`，直接由 55201 静态服务生效；没有重启产品内核或主 DSH。
