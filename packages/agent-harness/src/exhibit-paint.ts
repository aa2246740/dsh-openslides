/**
 * Host exhibit painters. The harness picks a page kind and writes PPTD objects.
 * Copy/numbers come from the script — painters do not invent or round figures.
 */
import type {
  Bounds,
  ChartElement,
  ChartSeries,
  PptdElement,
  ShapeElement,
  TableCell,
  TableElement,
  TextElement,
} from "@open-slidestudio/pptd-v2";
import type { Palette } from "./playbook.js";
import type { SkillPageInput } from "./skill-pages.js";

export type ExhibitKind =
  | "cover"
  | "toc"
  | "kpi"
  | "two-col"
  | "chart"
  | "table"
  | "path"
  | "content"
  | "close";

export type HostPageCopy = {
  id: string;
  pageType: string;
  title: string;
  kicker?: string;
  lines: string[];
  body?: string;
  exhibit?: ExhibitKind;
};

export type KpiCard = { label: string; value: string; note?: string };
export type NamedValue = { name: string; value: number; raw: string };

const SLIDE_W = 960;
const SLIDE_H = 540;

export function blobOf(copy: HostPageCopy): string {
  return `${copy.pageType} ${copy.title} ${copy.kicker || ""} ${copy.body || ""} ${copy.lines.join(" ")}`;
}

export function classifyExhibit(
  copy: HostPageCopy,
  index: number,
  total: number,
): ExhibitKind {
  const blob = blobOf(copy);
  const type = (copy.pageType || "").toLowerCase();
  if (type === "cover" || /封面/.test(copy.title) || (index === 0 && /封面/.test(blob))) {
    return "cover";
  }
  if (type === "toc" || /目录/.test(copy.title) || /目录/.test(blob.slice(0, 80))) {
    return "toc";
  }
  if (/KPI|仪表盘|核心指标|一页看|大卡片|2\s*[×xX]\s*3|上6卡片|6卡片/.test(blob)) return "kpi";
  if (/利润表|四列表|区域表|对照表/.test(blob)) return "table";
  if (/环形|折线|柱状|瀑布|图表|sparkline|三图|拆解|趋势/.test(blob)) return "chart";
  if (/漏斗/.test(blob) || type === "route" || /路径|三步|流程/.test(blob)) return "path";
  if (slashRowCount(blob) >= 4 || /附表|渠道（/.test(blob)) return "table";
  if (/亮点|左右分栏|对照卡|两栏/.test(blob) && /预警|风险|线下|线上/.test(blob)) return "two-col";
  if (
    type === "close" ||
    /收束|下一步|出发前|清单/.test(copy.title)
  ) {
    return "close";
  }
  if (index === total - 1 && /附录|口径/.test(`${copy.title} ${copy.kicker || ""}`)) {
    return slashRowCount(blob) >= 2 || /附表/.test(blob) ? "table" : "content";
  }
  return "content";
}

export function parseNumberToken(raw: string): number | null {
  const t = raw.replace(/[,，\s]/g, "").replace(/%$/, "");
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function extractKpis(copy: HostPageCopy): KpiCard[] {
  const text = copy.body || copy.lines.join("\n");
  const cards: KpiCard[] = [];
  const seen = new Set<string>();
  const push = (card: KpiCard) => {
    const key = `${card.label}|${card.value}`;
    if (seen.has(key) || !card.label || !card.value) return;
    seen.add(key);
    cards.push(card);
  };
  const cardBlock = text.match(/卡片[:：]([\s\S]{0,900}?)(?:Sparkline|脚注|版式|分层|【|$)/);
  const pool = cardBlock?.[1] || text;
  const pieces: string[] = [];
  for (const raw of pool.split(/\n+/)) {
    const line = raw.trim();
    if (!line || /^(版式|结论|脚注|输出)/.test(line)) continue;
    if (/[｜|]/.test(line) && line.split(/[｜|]/).length >= 3) {
      pieces.push(...line.split(/[｜|]/).map((s) => s.trim()).filter(Boolean));
    } else {
      pieces.push(line);
    }
  }
  for (const line of pieces) {
    const parsed = splitKpiLine(line);
    if (parsed) push(parsed);
    if (cards.length >= 6) break;
  }
  if (cards.length < 3) {
    for (const line of copy.lines) {
      const parsed = splitKpiLine(line);
      if (parsed) push(parsed);
      if (cards.length >= 6) break;
    }
  }
  return cards.slice(0, 6);
}

export function splitKpiLine(line: string): KpiCard | null {
  const cleaned = line
    .replace(/^\s*(?:\d+[\.、．)]\s*|[•●\-]\s*)/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 4) return null;
  const pipe = cleaned.split(/[｜|]/);
  const head = pipe[0]!.trim();
  const note = pipe.slice(1).join(" · ").replace(/[↑↓]/g, "").trim();
  const tail = head.match(
    /^(.+?)\s+([+\-−]?\d[\d,.]*(?:\.\d+)?\s*(?:亿|万|元|%|pct|家|万单|天|人|次|分钟)?)\s*$/i,
  );
  if (tail) {
    return {
      label: tail[1]!.replace(/[:：]\s*$/, "").trim().slice(0, 16),
      value: tail[2]!.trim(),
      note: note || undefined,
    };
  }
  const colon = head.match(/^(.{2,16})[:：]\s*(.+)$/);
  if (colon) {
    return {
      label: colon[1]!.trim(),
      value: colon[2]!.trim().slice(0, 24),
      note: note || undefined,
    };
  }
  return null;
}

export function extractPairs(text: string): NamedValue[] {
  const out: NamedValue[] = [];
  const seen = new Set<string>();
  const slashChunks = text.split(/\n+/);
  for (const line of slashChunks) {
    if (/[\/／]/.test(line) && /\d/.test(line)) {
      for (const part of line.split(/[\/／]/)) {
        const hit = namedValue(part.trim());
        if (hit && !seen.has(hit.name)) {
          seen.add(hit.name);
          out.push(hit);
        }
      }
    }
  }
  if (out.length >= 2) return out.slice(0, 8);
  const re =
    /([\u4e00-\u9fffA-Za-z0-9＋+\-]{1,12})\s+([+\-−]?\d[\d,.]*)\s*(万|亿|%|元|家|天)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1]!.trim();
    if (/^(近|本|上|同比|环比|结论|版式|必须)/.test(name)) continue;
    const n = parseNumberToken(m[2]!);
    if (n === null) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, value: n, raw: `${m[2]}${m[3] || ""}` });
    if (out.length >= 8) break;
  }
  return out;
}

function namedValue(part: string): NamedValue | null {
  const m = part.match(
    /([\u4e00-\u9fffA-Za-z0-9]{1,12})\s+([+\-−]?\d[\d,.]*)\s*(万|亿|%|元|家|天|pct)?/,
  );
  if (!m) return null;
  const n = parseNumberToken(m[2]!);
  if (n === null) return null;
  const extra = part.match(/[（(]([^）)]+)[）)]/)?.[1]?.trim();
  const raw = [`${m[2]}${m[3] || ""}`, extra].filter(Boolean).join(" ");
  return { name: m[1]!.trim(), value: n, raw };
}

export function extractTable(copy: HostPageCopy): { columns: string[]; rows: string[][] } | null {
  const text = copy.body || copy.lines.join("\n");
  const colHit = text.match(
    /(?:列|表)[:：]\s*([^\n]+)|（([^）]{4,40})）[:：]?/,
  );
  let columns: string[] = [];
  if (colHit) {
    const raw = (colHit[1] || colHit[2] || "").replace(/[。．]/g, "");
    columns = raw.split(/[\/／|｜]/).map((s) => s.trim()).filter(Boolean);
  }
  const rows: string[][] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!/[\/／]/.test(line) || !/\d/.test(line)) continue;
    if (/^(列|版式|结论|脚注)/.test(line)) continue;
    const cells = slashRow(line);
    if (cells && cells.length >= 3) rows.push(cells);
  }
  if (rows.length < 2) return null;
  const width = Math.max(...rows.map((r) => r.length), columns.length);
  if (!columns.length) {
    columns = ["项", ...Array.from({ length: width - 1 }, (_, i) => `列${i + 1}`)];
  } else if (columns.length === width - 1) {
    columns = ["项", ...columns];
  }
  while (columns.length < width) columns.push(`列${columns.length + 1}`);
  return {
    columns: columns.slice(0, width),
    rows: rows.map((r) => {
      const next = r.slice(0, width);
      while (next.length < width) next.push("");
      return next;
    }),
  };
}

function slashRow(line: string): string[] | null {
  const cleaned = line.replace(/^[•●\-]\s*/, "");
  const m = cleaned.match(/^([^/／]+?)\s+(-?[\d].*)$/);
  if (m && /[\/／]/.test(m[2]!)) {
    return [m[1]!.trim(), ...m[2]!.split(/[\/／]/).map((s) => s.trim())];
  }
  const parts = cleaned.split(/[\/／]/).map((s) => s.trim()).filter(Boolean);
  return parts.length >= 3 ? parts : null;
}

function slashRowCount(text: string): number {
  return text.split(/\n+/).filter((l) => /[\/／]/.test(l) && /\d/.test(l)).length;
}

export function extractPathSteps(copy: HostPageCopy): string[] {
  const text = copy.body || copy.lines.join(" ");
  const arrow = text.split(/→|->/).map((s) => s.trim()).filter((s) => s.length >= 2);
  if (arrow.length >= 3) return arrow.slice(0, 6).map((s) => s.slice(0, 28));
  const numbered = (copy.body || "")
    .split(/\n+/)
    .map((l) => l.replace(/^\s*\d+[\.、．)]\s*/, "").trim())
    .filter((l) => l.length >= 2 && l.length <= 36 && !/^(版式|结论|脚注)/.test(l));
  if (numbered.length >= 3) return numbered.slice(0, 6);
  return copy.lines.filter((l) => l.length >= 2).slice(0, 6);
}

export function splitTwoCol(copy: HostPageCopy): {
  leftTitle: string;
  left: string[];
  rightTitle: string;
  right: string[];
} {
  const text = copy.body || copy.lines.join("\n");
  const items = (src: string) =>
    src
      .split(/\n+|；|;|①|②|③|④|⑤/)
      .map((s) => s.replace(/^[•●\-]\s*/, "").trim())
      .filter((s) => s.length >= 4 && !/^(版式|结论|脚注|左|右|绿底|红\/黄)/.test(s))
      .slice(0, 4)
      .map((s) => s.slice(0, 48));
  const offline = text.match(/线下[:：]([\s\S]*?)(?=\n线上[:：]|$)/);
  const online = text.match(/线上[:：]([\s\S]*?)(?=\n脚注[:：]|\n附[:：]|$)/);
  if (offline && online) {
    return {
      leftTitle: "线下",
      left: items(offline[1]!),
      rightTitle: "线上",
      right: items(online[1]!),
    };
  }
  const leftHit = text.match(/亮点[:：]([\s\S]*?)(?=\n预警[:：]|\n风险[:：]|$)/);
  const rightHit = text.match(/预警[:：]([\s\S]*?)(?=\n脚注[:：]|\n红灯[:：]|\n黄灯[:：]|$)/);
  const left = items(leftHit?.[1] || "");
  const right = items(rightHit?.[1] || "");
  return {
    leftTitle: "亮点",
    left: left.length ? left : copy.lines.slice(0, 3),
    rightTitle: "预警",
    right: right.length ? right : copy.lines.slice(3, 6),
  };
}

function txt(
  id: string,
  bounds: Bounds,
  text: string,
  opts: { fontSize?: number; color?: string; bold?: boolean; wrap?: boolean } = {},
): TextElement {
  return {
    elementId: id,
    elementType: "text",
    bounds,
    content: {
      text,
      fontSize: opts.fontSize ?? 16,
      color: opts.color ?? "#333333",
      bold: opts.bold,
      wrap: opts.wrap !== false,
    },
  };
}

function box(id: string, bounds: Bounds, color: string, shapeName = "roundRect"): ShapeElement {
  return {
    elementId: id,
    elementType: "shape",
    shapeName,
    bounds,
    fill: { type: "solid", color },
  };
}

function asTable(
  id: string,
  bounds: Bounds,
  columns: string[],
  rows: string[][],
  pal: Palette,
): TableElement {
  const colCount = columns.length;
  const width = bounds[2];
  const cells: TableCell[][] = [
    columns.map((c) => ({ text: c, bold: true, color: pal.primary, fill: { type: "solid", color: mix(pal.background, pal.primary, 0.12) } })),
    ...rows.map((row) => row.map((c) => ({ text: c, color: pal.text }))),
  ];
  return {
    elementId: id,
    elementType: "table",
    bounds,
    columnWidths: Array.from({ length: colCount }, () => width / colCount),
    rows: cells,
  };
}

function asChart(
  id: string,
  bounds: Bounds,
  kind: "bar" | "line" | "pie",
  pairs: NamedValue[],
  title: string,
  pal: Palette,
): ChartElement {
  const cols = ["项", "值"];
  const rows = pairs.map((p) => [p.name, p.value]);
  const series: ChartSeries[] = [
    { type: kind, name: "值", encode: { x: "项", y: "值" }, fill: pal.primary },
  ];
  return {
    elementId: id,
    elementType: "chart",
    bounds,
    data: { cols, rows },
    series,
    title,
    legend: kind === "pie",
    labels: true,
  };
}

function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  if (!pa || !pb) return a;
  const ch = (i: number) => Math.round(pa[i]! * (1 - t) + pb[i]! * t);
  return `#${[ch(0), ch(1), ch(2)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function hex(c: string): [number, number, number] | null {
  const m = c.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function header(
  copy: HostPageCopy,
  pal: Palette,
  index: number,
  ink: string,
): PptdElement[] {
  return [
    box("rule", [48, 28, 56, 5], pal.accent, "rect"),
    txt(
      "kicker",
      [720, 22, 192, 22],
      copy.kicker || String(index + 1).padStart(2, "0"),
      { fontSize: 13, color: pal.muted, wrap: false },
    ),
    txt("title", [48, 42, 860, 44], copy.title, {
      fontSize: copy.title.length > 18 ? 24 : 28,
      color: ink,
      bold: true,
    }),
  ];
}

function paintCover(copy: HostPageCopy, pal: Palette, imageSrc?: string): SkillPageInput {
  const navy = /海军|深蓝|月报|密级/.test(blobOf(copy));
  const bg = navy ? "#0B1F3A" : pal.background || "#F7F4EE";
  const ink = navy ? "#F4F1EA" : pal.primary || "#1F4E3D";
  const muted = navy ? "#B7C0CC" : pal.text || "#333333";
  const accent = pal.accent || "#C45C26";
  const meta = copy.lines.slice(0, 3).join("  ·  ") || copy.kicker || "";
  const elements: PptdElement[] = navy
    ? [
        box("ground", [0, 0, SLIDE_W, SLIDE_H], bg, "rect"),
        box("gold", [628, 72, 2, 396], accent, "rect"),
        txt("kicker", [80, 150, 520, 24], copy.kicker || "内部资料", {
          fontSize: 14,
          color: accent,
          bold: true,
        }),
        txt("title", [80, 186, 520, 120], copy.title, {
          fontSize: 36,
          color: ink,
          bold: true,
        }),
        txt("sub", [80, 330, 520, 56], meta, { fontSize: 15, color: muted }),
      ]
    : [
        box("band", [0, 0, 280, SLIDE_H], pal.primary || "#1F4E3D", "rect"),
        txt("kicker", [320, 160, 600, 28], copy.kicker || "", {
          fontSize: 14,
          color: accent,
          bold: true,
        }),
        txt("title", [320, 200, 600, 120], copy.title, {
          fontSize: 36,
          color: pal.primary || "#1F4E3D",
          bold: true,
        }),
        txt("sub", [320, 340, 600, 80], meta, { fontSize: 16, color: pal.text || "#333333" }),
      ];
  if (imageSrc) {
    elements.push({
      elementId: "hero",
      elementType: "image",
      bounds: navy ? [660, 120, 240, 300] : [0, 0, 280, 540],
      src: imageSrc,
      fit: { mode: "cover" },
    });
  }
  return { id: copy.id, pageType: "cover", background: { type: "solid", color: bg }, elements };
}

function paintToc(copy: HostPageCopy, pal: Palette, index: number, all: HostPageCopy[]): SkillPageInput {
  const items = all.length > 2
    ? all.map((p, i) => `${String(i + 1).padStart(2, "0")}  ${p.title}`)
    : copy.lines;
  const mid = Math.ceil(items.length / 2);
  const left = items.slice(0, mid);
  const right = items.slice(mid);
  const elements: PptdElement[] = [
    ...header(copy, pal, index, pal.primary),
    box("col-l", [48, 104, 420, 396], mix(pal.background, pal.primary, 0.06)),
    box("col-r", [492, 104, 420, 396], mix(pal.background, pal.accent, 0.06)),
  ];
  left.forEach((line, i) => {
    elements.push(txt(`l-${i}`, [68, 124 + i * 36, 380, 32], line, { fontSize: 15, color: pal.text }));
  });
  right.forEach((line, i) => {
    elements.push(txt(`r-${i}`, [512, 124 + i * 36, 380, 32], line, { fontSize: 15, color: pal.text }));
  });
  return { id: copy.id, pageType: "toc", background: { type: "solid", color: pal.background }, elements };
}

function paintKpi(copy: HostPageCopy, pal: Palette, index: number): SkillPageInput {
  const cards = extractKpis(copy);
  const used: KpiCard[] = cards.length
    ? cards
    : copy.lines.slice(0, 6).map((l, i) => ({
        label: `指标${i + 1}`,
        value: l.slice(0, 16),
      }));
  const cols = used.length > 4 ? 3 : Math.min(2, used.length) || 2;
  const rows = Math.ceil(used.length / cols) || 1;
  const gridX = 48;
  const gridY = 108;
  const gridW = 864;
  const gridH = used.length >= 4 ? 300 : 340;
  const gap = 14;
  const cw = (gridW - gap * (cols - 1)) / cols;
  const ch = (gridH - gap * (rows - 1)) / rows;
  const elements: PptdElement[] = [...header(copy, pal, index, pal.primary)];
  used.forEach((card, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = gridX + c * (cw + gap);
    const y = gridY + r * (ch + gap);
    elements.push(box(`kpi-${i}`, [x, y, cw, ch], i % 2 ? mix(pal.background, pal.accent, 0.1) : mix(pal.background, pal.primary, 0.1)));
    elements.push(txt(`kpi-l-${i}`, [x + 16, y + 16, cw - 32, 24], card.label, { fontSize: 13, color: pal.muted }));
    elements.push(txt(`kpi-v-${i}`, [x + 16, y + 44, cw - 32, 44], card.value, { fontSize: 26, color: pal.primary, bold: true }));
    if (card.note) {
      elements.push(txt(`kpi-n-${i}`, [x + 16, y + ch - 36, cw - 32, 24], card.note, { fontSize: 12, color: pal.text }));
    }
  });
  const spark = extractPairs((copy.body || "").split(/Sparkline|近6月营收/)[1] || "");
  if (spark.length >= 3) {
    elements.push(asChart("spark", [48, 424, 864, 92], "line", spark, "近6月", pal));
  }
  return { id: copy.id, pageType: copy.pageType || "content", background: { type: "solid", color: pal.background }, elements };
}

function paintTable(copy: HostPageCopy, pal: Palette, index: number): SkillPageInput {
  const parsed = extractTable(copy);
  const elements: PptdElement[] = [...header(copy, pal, index, pal.primary)];
  if (copy.kicker && copy.kicker.length > 4) {
    elements.push(txt("so", [48, 90, 864, 28], copy.kicker, { fontSize: 14, color: pal.text }));
  }
  if (parsed) {
    elements.push(asTable("table", [48, 124, 864, 380], parsed.columns, parsed.rows, pal));
  } else {
    copy.lines.slice(0, 8).forEach((line, i) => {
      elements.push(txt(`line-${i}`, [48, 124 + i * 42, 864, 38], line, { fontSize: 16, color: pal.text }));
    });
  }
  return { id: copy.id, pageType: copy.pageType || "content", background: { type: "solid", color: pal.background }, elements };
}

function paintChart(copy: HostPageCopy, pal: Palette, index: number): SkillPageInput {
  const blob = blobOf(copy);
  const pairs = extractPairs(copy.body || copy.lines.join("\n"));
  const kind: "bar" | "line" | "pie" = /环形|饼|占比/.test(blob)
    ? "pie"
    : /折线|趋势|近\d月/.test(blob)
      ? "line"
      : "bar";
  const elements: PptdElement[] = [...header(copy, pal, index, pal.primary)];
  if (copy.kicker && copy.kicker.length > 4) {
    elements.push(txt("so", [48, 90, 864, 24], copy.kicker, { fontSize: 14, color: pal.text }));
  }
  const blocks = splitChartBlocks(copy.body || "");
  if (blocks.length >= 2 && pairs.length >= 3) {
    const width = (864 - 16 * (Math.min(blocks.length, 3) - 1)) / Math.min(blocks.length, 3);
    blocks.slice(0, 3).forEach((block, i) => {
      const local = extractPairs(block);
      const used = local.length >= 2 ? local : pairs.slice(i * 2, i * 2 + 3);
      if (!used.length) return;
      const localKind: "bar" | "line" | "pie" = /环形|饼/.test(block) ? "pie" : /折/.test(block) ? "line" : "bar";
      const x = 48 + i * (width + 16);
      elements.push(asChart(`chart-${i}`, [x, 124, width, 336], localKind, used, block.slice(0, 12), pal));
      elements.push(
        txt(`cap-${i}`, [x, 468, width, 36], used.map((p) => `${p.name} ${p.raw}`).join(" · "), {
          fontSize: 11,
          color: pal.muted,
        }),
      );
    });
  } else if (pairs.length >= 2) {
    elements.push(asChart("chart", [48, 124, 864, 352], kind, pairs, copy.title, pal));
    elements.push(
      txt("cap", [48, 484, 864, 28], pairs.map((p) => `${p.name} ${p.raw}`).join("  ·  "), {
        fontSize: 12,
        color: pal.muted,
      }),
    );
  } else {
    copy.lines.slice(0, 8).forEach((line, i) => {
      elements.push(txt(`line-${i}`, [48, 124 + i * 42, 864, 38], line, { fontSize: 16, color: pal.text }));
    });
  }
  return { id: copy.id, pageType: copy.pageType || "content", background: { type: "solid", color: pal.background }, elements };
}

function splitChartBlocks(body: string): string[] {
  const parts = body.split(/\n- |\n• |环形|堆叠|条形|折线/).map((s) => s.trim()).filter((s) => s.length > 8 && /\d/.test(s));
  return parts.slice(0, 3);
}

function paintTwoCol(copy: HostPageCopy, pal: Palette, index: number): SkillPageInput {
  const split = splitTwoCol(copy);
  const elements: PptdElement[] = [
    ...header(copy, pal, index, pal.primary),
    box("left", [48, 108, 420, 396], mix(pal.background, pal.primary, 0.1)),
    box("right", [492, 108, 420, 396], mix(pal.background, pal.danger || "#B42318", 0.08)),
    txt("lt", [68, 124, 380, 28], split.leftTitle, { fontSize: 16, color: pal.primary, bold: true }),
    txt("rt", [512, 124, 380, 28], split.rightTitle, { fontSize: 16, color: pal.danger || "#B42318", bold: true }),
  ];
  split.left.forEach((line, i) => {
    elements.push(txt(`ll-${i}`, [68, 168 + i * 76, 380, 68], line, { fontSize: 15, color: pal.text }));
  });
  split.right.forEach((line, i) => {
    elements.push(txt(`rl-${i}`, [512, 168 + i * 76, 380, 68], line, { fontSize: 15, color: pal.text }));
  });
  return { id: copy.id, pageType: copy.pageType || "content", background: { type: "solid", color: pal.background }, elements };
}

function paintPath(copy: HostPageCopy, pal: Palette, index: number): SkillPageInput {
  const steps = extractPathSteps(copy);
  const elements: PptdElement[] = [...header(copy, pal, index, pal.primary)];
  const n = Math.max(steps.length, 1);
  const w = Math.min(200, (864 - 16 * (n - 1)) / n);
  steps.forEach((step, i) => {
    const x = 48 + i * (w + 16);
    elements.push(box(`step-${i}`, [x, 180, w, 200], mix(pal.background, pal.primary, 0.12)));
    elements.push(txt(`sn-${i}`, [x + 12, 196, w - 24, 28], String(i + 1).padStart(2, "0"), { fontSize: 18, color: pal.accent, bold: true }));
    elements.push(txt(`st-${i}`, [x + 12, 232, w - 24, 128], step, { fontSize: 14, color: pal.text }));
    if (i < steps.length - 1) {
      elements.push(box(`join-${i}`, [x + w, 272, 16, 4], pal.accent, "rect"));
    }
  });
  return { id: copy.id, pageType: copy.pageType || "content", background: { type: "solid", color: pal.background }, elements };
}

function paintContent(copy: HostPageCopy, pal: Palette, index: number, imageSrc?: string): SkillPageInput {
  const shown = copy.lines.slice(0, 8);
  const lineH = shown.length > 4 ? 40 : 52;
  const fontSize = shown.length > 4 ? 15 : 18;
  const elements: PptdElement[] = [...header(copy, pal, index, pal.primary)];
  if (imageSrc) {
    elements.push({
      elementId: "photo",
      elementType: "image",
      bounds: [560, 120, 352, 380],
      src: imageSrc,
      fit: { mode: "cover" },
    });
    shown.forEach((line, i) => {
      elements.push(txt(`line-${i}`, [48, 108 + i * lineH, 488, lineH - 4], line, { fontSize, color: pal.text }));
    });
  } else {
    shown.forEach((line, i) => {
      elements.push(txt(`line-${i}`, [48, 108 + i * lineH, 864, lineH - 4], line, { fontSize, color: pal.text }));
    });
  }
  return { id: copy.id, pageType: copy.pageType || "content", background: { type: "solid", color: pal.background }, elements };
}

function paintClose(copy: HostPageCopy, pal: Palette, index: number): SkillPageInput {
  const elements: PptdElement[] = [
    box("band", [0, 0, 16, SLIDE_H], pal.primary, "rect"),
    txt("kicker", [64, 140, 800, 24], copy.kicker || "收束", { fontSize: 14, color: pal.accent, bold: true }),
    txt("title", [64, 176, 800, 80], copy.title, { fontSize: 32, color: pal.primary, bold: true }),
    txt("body", [64, 272, 800, 160], copy.lines.join("\n"), { fontSize: 16, color: pal.text }),
    txt("foot", [64, 480, 800, 24], "本报告数据均为虚构，仅用于演示", { fontSize: 12, color: pal.muted }),
  ];
  return { id: copy.id, pageType: "close", background: { type: "solid", color: pal.background }, elements };
}

function distinctiveNumbers(text: string): string[] {
  const found = text.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+%|\d+\.\d+(?=\s*(?:万|亿|元))/g) || [];
  return [...new Set(found)].filter((n) => n.replace(/[,.]/g, "").length >= 3).slice(0, 8);
}

function pageCopyBlob(elements: PptdElement[]): string {
  const bits: string[] = [];
  for (const el of elements) {
    if (el.elementType === "text") {
      const t = (el as TextElement).content?.text;
      if (t) bits.push(t);
    }
    if (el.elementType === "table") {
      for (const row of (el as TableElement).rows || []) {
        for (const cell of row) if (cell.text) bits.push(cell.text);
      }
    }
    if (el.elementType === "chart") {
      for (const row of (el as ChartElement).data?.rows || []) bits.push(row.map(String).join(" "));
    }
  }
  return bits.join("\n");
}

function stampMissingFacts(page: SkillPageInput, copy: HostPageCopy, pal: Palette): SkillPageInput {
  const src = `${copy.body || ""} ${copy.lines.join(" ")}`;
  const missing = distinctiveNumbers(src).filter((n) => !pageCopyBlob(page.elements).includes(n));
  if (!missing.length) return page;
  if (page.elements.some((el) => el.elementId === "facts")) return page;
  const bottom = Math.max(0, ...page.elements.map((el) => el.bounds[1] + el.bounds[3]));
  if (bottom > 516) return page;
  page.elements.push(
    txt("facts", [48, 518, 864, 18], missing.slice(0, 6).join("  ·  "), {
      fontSize: 11,
      color: pal.muted,
    }),
  );
  return page;
}

export function paintExhibit(
  copy: HostPageCopy,
  pal: Palette,
  index: number,
  all: HostPageCopy[],
  opts: { imageSrc?: string } = {},
): SkillPageInput {
  const kind = classifyExhibit(copy, index, all.length);
  let page: SkillPageInput;
  switch (kind) {
    case "cover":
      page = paintCover(copy, pal, opts.imageSrc);
      break;
    case "toc":
      page = paintToc(copy, pal, index, all);
      break;
    case "kpi":
      page = paintKpi(copy, pal, index);
      break;
    case "table":
      page = paintTable(copy, pal, index);
      break;
    case "chart":
      page = paintChart(copy, pal, index);
      break;
    case "two-col":
      page = paintTwoCol(copy, pal, index);
      break;
    case "path":
      page = paintPath(copy, pal, index);
      break;
    case "close":
      page = paintClose(copy, pal, index);
      break;
    default:
      page = paintContent(copy, pal, index, opts.imageSrc);
  }
  if (kind !== "cover") stampMissingFacts(page, copy, pal);
  return page;
}
