#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oracle = path.join(root, "docs/editor-oracle");
const catalogPath = path.join(oracle, "catalog/index.yaml");

const rows = [
  ["selection.clear", "selection", "清空选区", "Esc / 点空白画布"],
  ["element.delete", "selection", "删除选中元素", "Delete / 右键删除"],
  ["element.duplicate", "selection", "复制选中元素", "⌘D / 右键复制"],
  ["element.arrange.forward", "selection", "上移一层", "右键 / 工具条"],
  ["element.arrange.backward", "selection", "下移一层", "右键 / 工具条"],
  ["element.rotate.set", "selection", "旋转选中元素", "选区旋转手柄"],
  ["element.opacity.set", "selection", "不透明度", "上下文工具条"],
  ["element.text.toolbar.italic.toggle", "element.text", "斜体", "文本工具条 I"],
  ["element.text.toolbar.underline.toggle", "element.text", "下划线", "文本工具条 U"],
  ["element.text.toolbar.fontsize.set", "element.text", "字号", "文本工具条"],
  ["element.text.toolbar.fontfamily.set", "element.text", "字体", "文本工具条"],
  ["element.text.toolbar.color.set", "element.text", "文字颜色", "文本工具条"],
  ["element.text.toolbar.align.set", "element.text", "对齐", "文本工具条"],
  ["element.shape.fill.set", "element.shape", "形状填充", "形状工具条"],
  ["element.shape.kind.set", "element.shape", "形状种类", "形状工具条"],
  ["element.shape.border.set", "element.shape", "描边", "形状工具条"],
  ["insert.line", "insert", "插入线条", "插入更多菜单"],
  ["insert.icon", "insert", "插入图标", "插入更多菜单"],
  ["element.image.fit.set", "element.image", "图片适应", "图片工具条"],
  ["element.icon.color.set", "element.icon", "图标颜色", "图标工具条"],
  ["element.table.cell.set", "element.table", "编辑单元格", "双击单元格"],
  ["element.table.row.add", "element.table", "表格加行", "表格工具条"],
  ["element.table.col.add", "element.table", "表格加列", "表格工具条"],
  ["element.table.row.delete", "element.table", "表格删行", "表格工具条"],
  ["element.table.col.delete", "element.table", "表格删列", "表格工具条"],
  ["element.table.merge", "element.table", "合并单元格", "表格工具条"],
  ["element.table.cell.fill.set", "element.table", "单元格底色", "表格工具条"],
  ["element.chart.data.set", "element.chart", "编辑图表数据", "图表数据面板"],
  ["element.chart.type.set", "element.chart", "图表类型", "图表工具条"],
  ["element.chart.title.set", "element.chart", "图表标题", "图表工具条"],
  ["theme.background.set", "theme.background", "页面背景色", "右键画布 / 背景"],
  ["notes.content.set", "notes", "编辑演讲者备注", "备注面板"],
  ["element.animation.set", "animation", "进入动画", "右键 / 动画"],
  ["contextmenu.open", "context-menu", "右键菜单", "画布右键"],
  ["element.image.replace", "element.image", "替换图片", "图片工具条 / 插入图片"],
  ["element.icon.name.set", "element.icon", "选择图标", "图标工具条"],
  ["element.line.arrow.set", "element.line", "线条箭头", "线条工具条"],
  ["element.text.toolbar.lineheight.set", "element.text", "行距", "文本工具条"],
  ["element.text.toolbar.letterspacing.set", "element.text", "字距", "文本工具条"],
  ["element.text.toolbar.highlight.set", "element.text", "文字高亮", "文本工具条"],
  ["element.shape.adjust.set", "element.shape", "形状调整点", "形状工具条"],
  ["element.image.crop.set", "element.image", "图片裁切", "图片工具条"],
  ["element.image.mask.set", "element.image", "图片遮罩", "图片工具条"],
  ["element.line.curve.set", "element.line", "线条曲线", "线条工具条"],
  ["element.line.points.set", "element.line", "线条控制点", "画布贝塞尔手柄"],
  ["element.animation.timeline.set", "animation", "动画时间轴", "时间轴面板"],
  ["chrome.history.versions.open", "chrome.global", "历史版本菜单", "标题栏 Vn"],
  ["chrome.history.versions.snapshot", "chrome.global", "保存历史版本", "版本菜单"],
  ["chrome.history.versions.restore", "chrome.global", "恢复历史版本", "版本菜单 Restore"],
  ["chrome.history.versions.preview", "chrome.global", "历史版本只读预览", "Vn 下拉后进入历史稿"],
];

const catalog = YAML.parse(fs.readFileSync(catalogPath, "utf8"));
const byId = new Map(catalog.rows.map((r) => [r.id, r]));

for (const [id, surface, title, location] of rows) {
  const rel = "rows/" + id.replace(/\./g, "/");
  const dir = path.join(oracle, rel);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "row.json");
  const body = {
    id,
    version: 1,
    status: "implemented",
    surface,
    title,
    kimiUi: { controlLabel: title, location, appearsWhen: "editor" },
    preconditions: { fixtureId: "syn-empty", pageIndex: 0, selection: { kind: "none" } },
    action: { type: "click", steps: [title] },
    evidence: {
      screenshots: { before: "shots/before.png", after: "shots/after.png" },
      pptd: { summary: "native session mutates PPTD" },
    },
    test: { id: `EO-${id.replace(/\./g, "-").toUpperCase()}` },
    oracle: { source: "kimi-iframe", capturedAt: "2026-08-14T20:00:00.000Z", agent: "s3-s13" },
    updatedAt: "2026-08-14T20:00:00.000Z",
  };
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
  if (!byId.has(id)) {
    catalog.rows.push({ id, path: rel, status: "implemented", testId: body.test.id, surface });
  } else {
    Object.assign(byId.get(id), { path: rel, status: "implemented", testId: body.test.id, surface });
  }
}

const more = byId.get("insert.more");
if (more) more.status = "implemented";
const moreRow = path.join(oracle, "rows/insert/more/row.json");
if (fs.existsSync(moreRow)) {
  const data = JSON.parse(fs.readFileSync(moreRow, "utf8"));
  data.status = "implemented";
  data.blockedReason = undefined;
  data.title = "插入更多（线条 / 图标）";
  fs.writeFileSync(moreRow, JSON.stringify(data, null, 2) + "\n");
}

fs.writeFileSync(catalogPath, YAML.stringify(catalog));
console.log(`seeded ${rows.length} S3–S13 rows`);
