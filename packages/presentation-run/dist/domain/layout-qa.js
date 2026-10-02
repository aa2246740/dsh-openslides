import { colorAlpha, footerZoneTopForSlide, officialPptdColorKind, toRgbHex, } from "@open-slidestudio/pptd-v2";
import { persistPageKey } from "./page-identity.js";
import { isTodoExhibitKind } from "./page-plan.js";
export { TODO_EXHIBIT_KINDS, isTodoExhibitKind } from "./page-plan.js";
export { persistPageKey, persistPagePathFromId } from "./page-identity.js";
import { parseBounds } from "./skill-pages.js";
import { mediaExists } from "./media-store.js";
import { hasHomemadeFourCircles, hasKidsDoodle, hasOfficialRecipe, } from "./playbook-recipes.js";
export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;
const SLIDE = SLIDE_WIDTH * SLIDE_HEIGHT;
const TEXT_OVERLAP_PX = 4;
const OFFICIAL_RECIPE_TYPES = new Set([
    "cover-botanical",
    "title-band",
    "coral-rule",
    "chapter",
    "page-title",
    "route-path",
    "method-panels",
    "two-column-45-55",
    "demo-band",
    "two-column-body",
    "result-bar",
    "next-action",
    "footer-chrome",
    "header",
    "list",
    "box",
    "circle",
    "band",
]);
/** Compatibility path for old outlines. New runs must write typed exhibits. */
export function inferTodoExhibits(text) {
    const normalized = text
        .replace(/(?:无|不含|不要|without|no)\s*(?:数据)?表(?:格)?/gi, "")
        .replace(/(?:无|不含|不要|without|no)\s*图表/gi, "");
    const found = [];
    const add = (kind, pattern) => {
        if (pattern.test(normalized) && !found.includes(kind))
            found.push(kind);
    };
    add("chart:waterfall", /waterfall|瀑布/i);
    add("chart:scatter", /scatter|risk\s*matrix|风险矩阵/i);
    add("chart:pie", /donut|\bring\b|环形|饼图|圆环/i);
    add("chart:line", /spark(?:line)?|\bline\b|折线|趋势线/i);
    add("chart:bar", /\bbars\b|\bbar\s+(?:chart|graph)\b|stack(?:ed)?|柱|条形|堆[叠积]条|时效条|拆分条|账龄条/i);
    add("chart:combo", /combo|dual[-\s]?axis|双轴图/i);
    add("table", /\btables?\b|四列表|区域表|附表|数据表|底表|活动表|拆解表|缺货表|表格/i);
    add("diagram:funnel", /funnel|漏斗/i);
    add("diagram:gauge", /gauge|仪表盘/i);
    add("diagram:pyramid", /pyramid|金字塔/i);
    add("diagram:matrix", /decision\s*matrix|priority\s*matrix|决策矩阵|优先级矩阵|二维矩阵|2[×x]2/i);
    add("diagram:timeline", /timeline|时间线|路线图|里程碑/i);
    add("kpi-cards", /\bkpi\b|kpi\s*卡|(?:大|小)?卡片/i);
    add("comparison-cards", /comparison\s*cards?|对照卡/i);
    return found;
}
export function inferBriefPageExhibits(brief, pageNumber) {
    const sections = [
        ...brief.matchAll(/【第\s*(\d+)\s*页[^】]*】([\s\S]*?)(?=【第\s*\d+\s*页|$)/g),
    ];
    const section = sections.find((match) => Number(match[1]) === pageNumber)?.[2];
    return section ? inferTodoExhibits(section) : [];
}
/**
 * Resolve the executable exhibit contract for one todo page.
 * Explicit declarations, legacy outline wording, and page-specific brief
 * requirements are additive. A real requirement always removes `none`.
 */
export function resolveTodoExhibits(todo, index, brief) {
    const supplied = todo.exhibits?.filter(isTodoExhibitKind) ?? [];
    const inferred = inferTodoExhibits(`${todo.title}\n${todo.note ?? ""}`);
    const briefRequired = inferBriefPageExhibits(brief, index + 1);
    let exhibits = [...new Set([...supplied, ...inferred, ...briefRequired])];
    if (exhibits.some((kind) => kind !== "none")) {
        exhibits = exhibits.filter((kind) => kind !== "none");
    }
    return exhibits.length ? exhibits : ["none"];
}
function isVisibleChartExhibit(element) {
    if (element.elementType !== "chart")
        return false;
    const [, , width, height] = element.bounds;
    return width >= 24 && height >= 18 && (element.opacity ?? 1) >= 0.2;
}
function chartTypesOf(element) {
    if (!isVisibleChartExhibit(element))
        return [];
    return element.series.map((series) => {
        const raw = String(series.type ?? "bar").toLowerCase();
        return raw === "column" ? "bar" : raw;
    });
}
function roleElements(page, role) {
    return page.elements.filter((element) => element.exhibitRole === role);
}
function colorIsVisible(color) {
    return (colorAlpha(color) ?? 1) >= 0.2;
}
function diagramContributorIsVisible(element) {
    const [, , width, height] = element.bounds;
    if (element.hidden || (element.opacity ?? 1) < 0.2)
        return false;
    if (Math.max(width, height) < 8)
        return false;
    if (element.elementType === "text") {
        const text = element;
        return (text.content.text.trim().length > 0 &&
            (text.content.fontSize ?? 18) >= 4 &&
            colorIsVisible(text.content.color));
    }
    if (element.elementType === "line") {
        return colorIsVisible(element.border?.color);
    }
    if (element.elementType !== "shape")
        return false;
    const shape = element;
    const borderVisible = (shape.border?.width ?? 0) > 0 && colorIsVisible(shape.border?.color);
    if (borderVisible)
        return true;
    if (!shape.fill) {
        // Path-based shapes have a visible native default paint; CSS primitives
        // without an explicit fill or border are transparent.
        return !["rect", "roundRect", "ellipse"].includes(shape.shapeName);
    }
    if (shape.fill.type === "solid")
        return colorIsVisible(shape.fill.color);
    if (shape.fill.type === "gradient") {
        return shape.fill.stops.some((stop) => colorIsVisible(stop.color));
    }
    return (shape.fill.opacity ?? 1) >= 0.2;
}
function visibleRoleElements(page, role) {
    return roleElements(page, role).filter(diagramContributorIsVisible);
}
function hasStructuredDiagram(page, role) {
    const contributors = visibleRoleElements(page, role);
    const shapes = contributors
        .filter((element) => element.elementType === "shape")
        .sort((left, right) => left.bounds[1] - right.bounds[1]);
    const labels = contributors.filter((element) => element.elementType === "text");
    if (role === "matrix") {
        return shapes.length >= 4 && labels.length >= 2;
    }
    if (role === "timeline") {
        const connectors = contributors.filter((element) => element.elementType === "line");
        return shapes.length >= 3 && labels.length >= 2 && connectors.length >= 1;
    }
    if (role === "gauge") {
        return shapes.length >= 2 && labels.length >= 1;
    }
    if (shapes.length < 3 || labels.length < 2)
        return false;
    const widths = shapes.map((shape) => shape.bounds[2]);
    if (role === "funnel") {
        return widths.every((width, index) => index === 0 || width <= widths[index - 1] + 2);
    }
    return widths.every((width, index) => index === 0 || width + 2 >= widths[index - 1]);
}
function satisfiesRequestedExhibit(page, requirement) {
    if (requirement === "none")
        return true;
    if (requirement === "table") {
        return page.elements.some((element) => element.elementType === "table");
    }
    if (requirement === "kpi-cards") {
        return visibleRoleElements(page, "kpi-card").filter((element) => element.elementType === "shape").length >= 3;
    }
    if (requirement === "comparison-cards") {
        return visibleRoleElements(page, "comparison-card").filter((element) => element.elementType === "shape").length >= 2;
    }
    if (requirement.startsWith("chart:")) {
        const expected = requirement.slice("chart:".length);
        if (expected === "combo") {
            return page.elements.some((element) => {
                if (!isVisibleChartExhibit(element))
                    return false;
                const chart = element;
                return (new Set(chartTypesOf(chart)).size >= 2 &&
                    chart.series.some((series) => series.axis === "secondary"));
            });
        }
        return page.elements.some((element) => {
            const actual = chartTypesOf(element);
            if (expected === "line") {
                return actual.some((type) => type === "line" || type === "area");
            }
            return actual.includes(expected);
        });
    }
    const role = requirement.slice("diagram:".length);
    if (role === "matrix" &&
        page.elements.some((element) => chartTypesOf(element).includes("scatter"))) {
        return true;
    }
    return hasStructuredDiagram(page, role);
}
export function requestedExhibitIssues(page, todo) {
    if (!todo)
        return [];
    const declared = todo.exhibits?.filter(isTodoExhibitKind) ?? [];
    const requested = declared.length
        ? declared
        : inferTodoExhibits(`${todo.title}\n${todo.note ?? ""}`);
    return requested
        .filter((requirement) => !satisfiesRequestedExhibit(page, requirement))
        .map((requirement) => ({
        pageId: page.id,
        code: "missing_requested_exhibit",
        message: `page ${page.id} promised ${requirement} in write_todo but did not implement it as editable PPTD elements`,
    }));
}
function area(el) {
    const [, , w, h] = el.bounds;
    return Math.max(0, w) * Math.max(0, h);
}
export function pageCoverage(elements) {
    let sum = 0;
    for (const el of elements)
        sum += area(el);
    return Math.min(1, sum / SLIDE);
}
export function pageText(elements) {
    const bits = [];
    for (const el of elements) {
        if (el.elementType !== "text")
            continue;
        const text = el.content?.text;
        if (text)
            bits.push(text);
    }
    return bits.join("\n");
}
/** Compose/write refuse: send produce back. Do not host-fill leftover YAML. */
export const EMPTY_CLOSER_PRODUCE_NEXT = "closing page has no readable copy. write_page the last page as 结束页 with title, recap, and the meeting ask. Do not call compose_deck or review_pages until that write_page lands. Host will not paint leftover pages.";
/** Host-opened seed listed beside a real agent cover. Do not paint it. */
export const HOST_SEED_PRODUCE_NEXT = "host-opened seed 1_cover.page is still listed in the composed deck. persist-by-id kept the filename; compose will not seal a leftover seed as slide 1. write_page id 1_cover with real cover copy, or do not list the seed. Host will not paint leftover pages.";
/** Exact `createEmptyProject` basename. `01_cover` / `p01_cover` are agent ids. */
export function isHostOpenedSeedPath(name) {
    return name.replace(/\\/g, "/").split("/").pop() === "1_cover.page";
}
/**
 * Leftover host seed: white title-only `pages/1_cover.page` still in a multi-page
 * deck. Agent overwrite in place (readable copy on that file) is not leftover.
 */
export function isHostOpenedSeedPage(loaded, deckPageCount) {
    if (!isHostOpenedSeedPath(loaded.path))
        return false;
    if (deckPageCount <= 1)
        return false;
    return !pageHasReadableCopy({ elements: loaded.page.elements });
}
/**
 * Scan the whole composed page list. Last-page-only leftover-closer missed the
 * host seed sitting as slide 1 in front of a real agent cover.
 */
export function composedPageLeftoverIssues(pages) {
    const issues = [];
    const last = pages.length - 1;
    for (const [index, loaded] of pages.entries()) {
        const pageId = persistPageKey(loaded.path);
        if (isHostOpenedSeedPage(loaded, pages.length)) {
            issues.push({
                pageId,
                path: loaded.path,
                kind: "host_seed",
                message: HOST_SEED_PRODUCE_NEXT,
            });
            continue;
        }
        if (isLeftoverContentBasename(loaded.path)) {
            const empty = !pageHasVisibleContent({ elements: loaded.page.elements });
            if (empty || index === last) {
                issues.push({
                    pageId,
                    path: loaded.path,
                    kind: index === last ? "empty_closer" : "leftover_content",
                    message: EMPTY_CLOSER_PRODUCE_NEXT,
                });
                continue;
            }
        }
        if (index === last &&
            pages.length > 1 &&
            !pageHasReadableCopy({ elements: loaded.page.elements })) {
            issues.push({
                pageId,
                path: loaded.path,
                kind: "empty_closer",
                message: EMPTY_CLOSER_PRODUCE_NEXT,
            });
        }
    }
    return issues;
}
/**
 * Recorded rendered hard fail always blocks compose. Strict local-editor runs
 * additionally require a current deterministic pass even when vision is none.
 */
export function renderedLayoutBlocksCompose(layout, requireCurrentPass = false) {
    return layout === "fail" || (requireCurrentPass && layout !== "pass");
}
/** Cover/TOC are not closers. Last page, pageType final/close, or id closing. */
export function isCloserPage(page, index, last) {
    const type = (page.pageType || "").toLowerCase();
    const id = (page.id || "").toLowerCase();
    if (/^(final|close|closing|end)$/.test(type))
        return true;
    if (/(?:^|_|-)(closing|final|end)(?:$|_|-)/.test(id) || /结束/.test(id))
        return true;
    if (index != null && last != null && last > 0 && index === last)
        return true;
    return false;
}
/**
 * A real 结束页 needs title + recap (at least two visible text runs).
 * A navy field with arcs is not readable copy.
 */
export function pageHasReadableCopy(page) {
    const texts = page.elements.filter((el) => {
        if (el.elementType !== "text")
            return false;
        if (el.hidden || (el.opacity ?? 1) < 0.2)
            return false;
        return Boolean(el.content?.text?.trim());
    });
    const blob = texts.map((el) => el.content.text.replace(/\s+/g, "")).join("");
    return texts.length >= 2 && blob.length >= 16;
}
function visibleTextRuns(page) {
    return page.elements.filter((el) => {
        if (el.elementType !== "text")
            return false;
        if (el.hidden || (el.opacity ?? 1) < 0.2)
            return false;
        const text = el;
        return Boolean(text.content?.text?.trim());
    });
}
function tableHasBodyValues(el) {
    if (el.elementType !== "table")
        return false;
    const rows = el.rows;
    if (!Array.isArray(rows) || rows.length < 2)
        return false;
    return rows.slice(1).some((row) => row.some((cell) => Boolean(String(cell.text ?? "").trim())));
}
function chartHasSeriesValues(el) {
    if (el.elementType !== "chart")
        return false;
    const chart = el;
    const rows = chart.data?.rows ?? [];
    const hasValues = rows.some((row) => row.some((cell) => cell != null && String(cell).trim() !== ""));
    return hasValues && (chart.series?.length ?? 0) > 0;
}
/**
 * Visible content is text, table body values, or chart series.
 * Shape-area coverage is not content. A full-bleed navy rect is empty.
 */
export function pageHasVisibleContent(page) {
    if (visibleTextRuns(page).length > 0)
        return true;
    return page.elements.some((el) => tableHasBodyValues(el) || chartHasSeriesValues(el));
}
export function pageIdMatchesFile(pageId, filePath) {
    const id = pageId.trim();
    if (!id)
        return false;
    const key = persistPageKey(id);
    if (!key)
        return false;
    return key === persistPageKey(filePath);
}
export function isLeftoverContentBasename(name) {
    return /^\d+_content$/i.test(persistPageKey(name));
}
export function isPlaceholderReviewIssue(issue) {
    return /^(none|n\/a|na|null|ok|pass|-|无|没有)$/i.test(issue.trim());
}
function asIssueRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    const rec = value;
    if (Object.keys(rec).length === 1 && "item" in rec)
        return asIssueRecord(rec.item);
    return rec;
}
function rawBoundsTuple(raw) {
    const rec = asIssueRecord(raw);
    if (!rec)
        return undefined;
    const parsed = parseBounds(rec.bounds) ??
        parseBounds(rec.position) ??
        parseBounds(rec.x != null || rec.left != null
            ? [rec.x ?? rec.left, rec.y ?? rec.top, rec.w ?? rec.width, rec.h ?? rec.height]
            : undefined);
    return parsed ?? undefined;
}
function rawBoundsPresent(raw) {
    const rec = asIssueRecord(raw);
    if (!rec)
        return false;
    if (rec.bounds != null || rec.position != null)
        return true;
    const rect = asIssueRecord(rec.rect);
    if (rect && (rect.left != null || rect.x != null))
        return true;
    const style = asIssueRecord(rec.style);
    if (style && (style.left != null || style.x != null) && (style.width != null || style.w != null)) {
        return true;
    }
    return rec.x != null || rec.left != null;
}
function rawBoundsZeroArea(raw) {
    const rec = asIssueRecord(raw);
    if (!rec)
        return false;
    const candidate = rec.bounds ?? rec.position;
    if (!Array.isArray(candidate) || candidate.length < 4)
        return false;
    const width = Number(candidate[2]);
    const height = Number(candidate[3]);
    return Number.isFinite(width) && Number.isFinite(height) && width * height <= 0;
}
function isOfficialRecipeType(raw) {
    const rec = asIssueRecord(raw);
    const type = typeof rec?.type === "string" ? rec.type.trim().toLowerCase() : "";
    return Boolean(type) && OFFICIAL_RECIPE_TYPES.has(type);
}
function coerceRawElements(rawPage) {
    const elements = rawPage.elements;
    if (Array.isArray(elements))
        return elements;
    const rec = asIssueRecord(elements);
    if (rec && Array.isArray(rec.item))
        return rec.item;
    return [];
}
/** Reject omitted / invented / zero-area bounds on the agent payload, before parse fills them. */
export function rawPageBoundsIssues(rawPage, pageId) {
    const issues = [];
    for (const [index, raw] of coerceRawElements(rawPage).entries()) {
        if (isOfficialRecipeType(raw))
            continue;
        const rec = asIssueRecord(raw);
        const elementId = (typeof rec?.elementId === "string" && rec.elementId) ||
            (typeof rec?.id === "string" && rec.id) ||
            `el-${index + 1}`;
        if (rawBoundsZeroArea(raw)) {
            issues.push({
                pageId,
                code: "zero_area",
                message: `element ${elementId} has zero-area bounds`,
            });
            continue;
        }
        if (!rawBoundsPresent(raw) || !rawBoundsTuple(raw)) {
            issues.push({
                pageId,
                code: "bounds_omitted",
                message: `element ${elementId} omitted bounds — host will not invent them`,
            });
        }
    }
    return issues;
}
const CHART_SLOT_LABEL = /走势|架构|跃迁|示意图|趋势图|规模.*示意|三层架构/;
function boundsOverlap(a, b, minPx = 24) {
    const overlapW = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
    const overlapH = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
    return overlapW >= minPx && overlapH >= minPx;
}
function isExhibitElement(el) {
    if (el.elementType === "chart" || el.elementType === "table" || el.elementType === "image") {
        return true;
    }
    if (el.elementType !== "shape")
        return false;
    const [, , w, h] = el.bounds;
    return w >= 120 && h >= 48;
}
/** Label promised a figure; host will not leave a hollow slot. */
export function chartSlotWithoutExhibitIssues(page) {
    const issues = [];
    for (const el of page.elements) {
        if (el.elementType !== "text")
            continue;
        const text = (el.content?.text ?? "").replace(/\s+/g, "");
        if (!CHART_SLOT_LABEL.test(text))
            continue;
        const [x, y, w, h] = el.bounds;
        const slot = [
            x,
            y + h,
            Math.max(w, 200),
            Math.max(80, Math.min(280, 500 - (y + h))),
        ];
        const filled = page.elements.some((other) => other.elementId !== el.elementId && isExhibitElement(other) && boundsOverlap(other.bounds, slot));
        if (filled)
            continue;
        issues.push({
            pageId: page.id,
            code: "empty_box",
            message: `page ${page.id} label "${el.content?.text}" has no chart, table, or figure in the slot below it`,
        });
    }
    return issues;
}
export function tableEmptyCellIssues(page) {
    const issues = [];
    for (const el of page.elements) {
        if (el.elementType !== "table")
            continue;
        const rows = el.rows;
        if (!Array.isArray(rows) || rows.length < 2)
            continue;
        const header = rows[0].map((cell) => (cell?.text ?? "").trim());
        for (const [col, title] of header.entries()) {
            if (!title)
                continue;
            for (const [rowIndex, row] of rows.slice(1).entries()) {
                const value = (row[col]?.text ?? "").trim();
                if (value)
                    continue;
                issues.push({
                    pageId: page.id,
                    code: "empty_cell",
                    message: `table ${el.elementId} header ${title} has an empty body value in row ${rowIndex + 1}`,
                });
            }
        }
    }
    return issues;
}
function rectsOverlap(a, b, minPx) {
    const overlapW = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
    const overlapH = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
    return overlapW >= minPx && overlapH >= minPx;
}
export function pageGeometryIssues(page) {
    const issues = [];
    const texts = [];
    for (const el of page.elements) {
        const [x, y, w, h] = el.bounds;
        if (w <= 0 || h <= 0) {
            issues.push({
                pageId: page.id,
                code: "zero_area",
                message: `element ${el.elementId} has zero-area bounds ${w}×${h}`,
            });
        }
        const contentBox = el.elementType === "text" || el.elementType === "table" || el.elementType === "chart";
        if (contentBox && (x < 0 || y < 0 || x + w > SLIDE_WIDTH || y + h > SLIDE_HEIGHT)) {
            issues.push({
                pageId: page.id,
                code: "overflow",
                message: `element ${el.elementId} overflows 960×540 at [${x},${y},${w},${h}]`,
            });
        }
        if (el.elementType === "text")
            texts.push(el);
    }
    const footerTop = footerZoneTopForSlide(SLIDE_HEIGHT);
    for (const text of texts) {
        if (text.hidden)
            continue;
        if (text.layoutRole === "footer" || text.layoutRole === "decoration")
            continue;
        const [, y, , h] = text.bounds;
        if (y >= footerTop || y + h > footerTop) {
            issues.push({
                pageId: page.id,
                code: "footer_zone",
                message: `text ${text.elementId} sits in the footer reserve starting at ${footerTop} without layoutRole=footer`,
            });
        }
    }
    for (let i = 0; i < texts.length; i += 1) {
        for (let j = i + 1; j < texts.length; j += 1) {
            const left = texts[i];
            const right = texts[j];
            if (!rectsOverlap(left.bounds, right.bounds, TEXT_OVERLAP_PX))
                continue;
            issues.push({
                pageId: page.id,
                code: "overlap",
                message: `text ${left.elementId} overlaps ${right.elementId}`,
            });
        }
    }
    return issues;
}
export const REUSED_COVER_SRC_DETAIL = "full-bleed image src is already used on another page; each photo-led page needs its own media id";
const FULL_BLEED_AREA = SLIDE_WIDTH * SLIDE_HEIGHT * 0.45;
function isCoverWritePage(page) {
    if (page.pageType === "cover")
        return true;
    const key = persistPageKey(page.id);
    return key === "cover" || key === "1_cover";
}
function isFullBleedImage(el) {
    if (el.elementType !== "image")
        return false;
    const [x, y, w, h] = el.bounds;
    if (w * h >= FULL_BLEED_AREA)
        return true;
    return x <= 12 && y <= 12 && w >= 880 && h >= 480;
}
export function reusedFullBleedSrcIssue(page, siblingImageSrcs) {
    if (isCoverWritePage(page))
        return undefined;
    for (const el of page.elements) {
        if (!isFullBleedImage(el))
            continue;
        const src = el.src.trim();
        if (!src)
            continue;
        const other = siblingImageSrcs.find((row) => persistPageKey(row.pageId) !== persistPageKey(page.id) && row.src === src);
        if (other) {
            return {
                pageId: page.id,
                code: "reused_cover_src",
                message: `reused full-bleed src ${src} already used on ${other.pageId}. ${REUSED_COVER_SRC_DETAIL}`,
            };
        }
    }
    return undefined;
}
/** A photo todo promises a photo-led page; media must exist before write_page. */
export function photoExhibitIssues(page, ctx) {
    if (!ctx.photoExhibit)
        return [];
    const images = page.elements.filter((el) => el.elementType === "image");
    if (!images.length) {
        return [
            {
                pageId: page.id,
                code: "missing_media",
                message: `page ${page.id} todo marks a photo-led page — decide the photo frame, generate_image with that width and height, then include the image element in write_page`,
            },
        ];
    }
    const issues = [];
    for (const el of images) {
        if (ctx.projectRoot && !mediaExists(ctx.projectRoot, el.src)) {
            issues.push({
                pageId: page.id,
                code: "missing_media",
                message: `page ${page.id} chose an image src ${el.src} that is not in media/ — run search_image or generate_image first`,
            });
        }
    }
    const unique = images.some((el) => !ctx.siblingImageSrcs?.some((row) => row.src === el.src));
    if (!unique) {
        issues.push({
            pageId: page.id,
            code: "reused_cover_src",
            message: `page ${page.id} photo hero reuses another page's src — each photo-led page needs its own media id`,
        });
    }
    return issues;
}
function isLastDiskPage(page, ctx) {
    const last = ctx.lastDiskBasename;
    if (!last || (ctx.diskPageCount ?? 0) <= 1)
        return false;
    return persistPageKey(page.id) === persistPageKey(last);
}
export function isWritePageCloser(page, ctx = {}) {
    if (isCloserPage(page, ctx.writtenIndex, ctx.writtenLast))
        return true;
    if (isLastDiskPage(page, ctx))
        return true;
    if (isLeftoverContentBasename(page.id) && (ctx.diskPageCount ?? 0) > 1)
        return true;
    return false;
}
function toCatalogHexSet(value) {
    if (!value)
        return undefined;
    const set = new Set();
    for (const raw of value) {
        const hex = String(raw).trim().toUpperCase();
        if (/^#[0-9A-F]{6}$/.test(hex))
            set.add(hex);
    }
    return set.size ? set : undefined;
}
function recordWritePageColor(value, trail, pageId, issues, theme, pack) {
    const kind = officialPptdColorKind(value);
    if (kind === "omitted")
        return;
    let hex;
    try {
        hex = toRgbHex(value, theme);
    }
    catch {
        issues.push({
            pageId,
            code: "invalid_color",
            message: `color ${JSON.stringify(value)} at ${trail} is not official PPTD #RRGGBB / #RRGGBBAA / Theme.colors $token (${kind}); ` +
                `write_page refused. Unprefixed RRGGBB and unresolved $theme must not become #000000.`,
        });
        return;
    }
    const adopted = toCatalogHexSet(pack?.adoptedPackHexes);
    if (!adopted || adopted.has(hex))
        return;
    if (trail === "background.color") {
        if (pack?.backgroundColorOverride === true)
            return;
        if (pack?.persistedBackgroundColor) {
            try {
                if (toRgbHex(pack.persistedBackgroundColor, theme) === hex)
                    return;
            }
            catch {
                // An invalid baseline never grants a pack exception.
            }
        }
    }
    const packId = pack?.adoptedPackId?.trim() || "pack";
    issues.push({
        pageId,
        code: "pack_color",
        message: `color ${JSON.stringify(value)} → ${hex} at ${trail} is not adopted ${packId} PART B 【Color Palette】. ` +
            `Allowed pack colors: ${[...adopted].sort().join(", ")}. ` +
            `After adopt, official Color must be a pack hex or a Theme.colors $token that resolves to that pack. ` +
            `write_page refused. Host did not snap colors. Host did not paint and did not rebind Theme.colors.`,
    });
}
const HTML_STYLE_COLOR_KEYS = new Set(["color", "background-color"]);
/**
 * Official PPTD rich text (`reference/pptd.md`): `<p>` / `<li>` / `<span>`
 * `style` Color-type values (`color`, `background-color`) resolve per Color
 * (HEX6 / HEX8 / Theme.colors `$token`). Unprefixed `color:0E0807` is not a Color.
 * Plain text that merely mentions `0E0807` is not walked.
 */
function visitHtmlStyleColors(html, trail, pageId, issues, theme, pack) {
    const styleAttr = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi;
    let match;
    while ((match = styleAttr.exec(html))) {
        const css = match[2] ?? "";
        for (const part of css.split(";")) {
            const colon = part.indexOf(":");
            if (colon < 0)
                continue;
            const key = part.slice(0, colon).trim().toLowerCase();
            if (!HTML_STYLE_COLOR_KEYS.has(key))
                continue;
            let raw = part.slice(colon + 1).trim();
            if ((raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) ||
                (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)) {
                raw = raw.slice(1, -1).trim();
            }
            if (!raw)
                continue;
            recordWritePageColor(raw, `${trail}@style.${key}`, pageId, issues, theme, pack);
        }
    }
}
function visitWritePageColors(value, trail, pageId, issues, theme, pack) {
    if (value == null)
        return;
    if (typeof value === "string") {
        const leaf = trail.split(".").pop() ?? "";
        if (leaf === "text" && /<[a-z]/i.test(value)) {
            visitHtmlStyleColors(value, trail, pageId, issues, theme, pack);
            return;
        }
        const colorLeaf = leaf === "color" || leaf === "backgroundColor" || /^colors\[\d+\]$/.test(leaf);
        if (!colorLeaf)
            return;
        recordWritePageColor(value, trail, pageId, issues, theme, pack);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => visitWritePageColors(item, `${trail}[${index}]`, pageId, issues, theme, pack));
        return;
    }
    if (typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
            visitWritePageColors(nested, trail ? `${trail}.${key}` : key, pageId, issues, theme, pack);
        }
    }
}
export function writePageColorIssues(page, theme, pack) {
    const issues = [];
    visitWritePageColors(page.elements, "elements", page.id, issues, theme, pack);
    if (page.background)
        visitWritePageColors(page.background, "background", page.id, issues, theme, pack);
    return issues;
}
/**
 * Deterministic YAML/schema refuse for write_page. Empty navy, empty table
 * cells, and invented bounds are not vision problems.
 */
export function writePageSchemaIssues(page, ctx = {}, rawPage) {
    const issues = [];
    if (rawPage)
        issues.push(...rawPageBoundsIssues(rawPage, page.id));
    if (isWritePageCloser(page, ctx) && !pageHasReadableCopy(page)) {
        issues.push({
            pageId: page.id,
            code: "empty",
            message: EMPTY_CLOSER_PRODUCE_NEXT,
        });
    }
    else if (!pageHasVisibleContent(page)) {
        issues.push({
            pageId: page.id,
            code: "empty",
            message: `page ${page.id} has no visible text, table body values, or chart series — shape-area coverage is not content`,
        });
    }
    issues.push(...tableEmptyCellIssues(page));
    issues.push(...pageGeometryIssues(page));
    issues.push(...chartSlotWithoutExhibitIssues(page));
    issues.push(...photoExhibitIssues(page, ctx));
    issues.push(...writePageColorIssues(page, ctx.theme, ctx));
    if (ctx.siblingImageSrcs?.length) {
        const reused = reusedFullBleedSrcIssue(page, ctx.siblingImageSrcs);
        if (reused)
            issues.push(reused);
    }
    return issues;
}
export function writePageSchemaError(issues, page, ctx = {}) {
    if (!issues.length)
        return undefined;
    const structural = issues.find((issue) => issue.code === "bounds_omitted" ||
        issue.code === "zero_area" ||
        issue.code === "overflow" ||
        issue.code === "overlap" ||
        issue.code === "empty_cell" ||
        issue.code === "footer_zone" ||
        issue.code === "invalid_color" ||
        issue.code === "pack_color" ||
        issue.code === "empty_box" ||
        issue.code === "reused_cover_src" ||
        issue.code === "missing_media");
    if (structural) {
        return {
            error: structural.code,
            detail: issues.map((issue) => issue.message).join("\n"),
            pageId: page.id,
        };
    }
    const closer = issues.find((issue) => issue.code === "empty" && isWritePageCloser(page, ctx) && !pageHasReadableCopy(page));
    if (closer) {
        return {
            error: "empty_closer",
            detail: EMPTY_CLOSER_PRODUCE_NEXT,
            pageId: page.id,
        };
    }
    const first = issues[0];
    return {
        error: first.code,
        detail: issues.map((issue) => issue.message).join("\n"),
        pageId: page.id,
    };
}
function isBody(page, index, last) {
    const t = (page.pageType || "").toLowerCase();
    if (t === "cover" || t === "close" || t === "toc")
        return false;
    if (index === 0 || index === last)
        return false;
    return true;
}
/** Every classroom page, including cover and takeaway, needs a drawing — not cards+copy. */
export function isCoursewareExhibitPage(_page, _index, _last) {
    return true;
}
function isPlateShape(el) {
    if (el.elementType !== "shape")
        return false;
    const name = String(el.shapeName || "rect").toLowerCase();
    return name === "rect" || name === "roundrect" || name === "round_rect";
}
function shapeNameOf(el) {
    return el.elementType === "shape" ? String(el.shapeName || "").toLowerCase() : "";
}
/**
 * Agent-drawn paper-white layouts (no host recipe ids).
 * Cover: giant blush circle + band. Route: coral rule + vertical spine + stations.
 * Concept: coral rule + two columns. Method: three condition panels.
 * Demo: top band + result bar. Transfer: action panel.
 */
export function hasPaperWhiteStructure(elements) {
    if (hasOfficialRecipe(elements))
        return true;
    const shapes = elements.filter((el) => el.elementType === "shape");
    const ellipses = shapes.filter((el) => shapeNameOf(el) === "ellipse");
    const plates = shapes.filter((el) => isPlateShape(el));
    const texts = elements.filter((el) => el.elementType === "text");
    const giant = ellipses.some((el) => el.bounds[2] >= 280 && el.bounds[3] >= 280);
    const band = plates.some((el) => el.bounds[1] >= 240 && el.bounds[2] >= 400 && el.bounds[3] >= 80);
    if (giant && band)
        return true;
    const coralRule = plates.some((el) => el.bounds[2] <= 120 && el.bounds[3] <= 16);
    const spine = plates.some((el) => el.bounds[2] <= 12 && el.bounds[3] >= 200);
    if ((coralRule || spine) && ellipses.length >= 3)
        return true;
    const left = texts.some((el) => el.bounds[0] < 200 && el.bounds[2] >= 280);
    const right = texts.some((el) => el.bounds[0] >= 480 && el.bounds[2] >= 280);
    if (coralRule && left && right)
        return true;
    const columns = plates.filter((el) => el.bounds[2] >= 220 && el.bounds[2] <= 340 && el.bounds[3] >= 180);
    if (columns.length >= 3)
        return true;
    const topBand = plates.some((el) => el.bounds[0] <= 8 && el.bounds[2] >= 800 && el.bounds[3] >= 48 && el.bounds[3] <= 140);
    const resultBar = plates.some((el) => el.bounds[2] >= 700 && el.bounds[3] >= 48 && el.bounds[1] >= 350);
    if (topBand && (resultBar || texts.length >= 4))
        return true;
    const actionPanel = plates.some((el) => el.bounds[2] >= 700 && el.bounds[3] >= 160);
    if (actionPanel && texts.length >= 3)
        return true;
    return false;
}
/** Official recipe or a real exhibit — not two colored cards plus homework copy. */
export function hasDrawnExhibit(elements) {
    if (hasPaperWhiteStructure(elements))
        return true;
    if (elements.some((el) => el.elementType === "image" && Boolean(el.src))) {
        return true;
    }
    if (elements.some((el) => el.elementType === "table" || el.elementType === "chart")) {
        return true;
    }
    const drawn = elements.filter((el) => el.elementType === "shape" && !isPlateShape(el));
    if (drawn.length >= 2)
        return true;
    if (drawn.length === 1 && area(drawn[0]) >= 80 * 80)
        return true;
    return false;
}
export function detectExhibit(elements) {
    if (hasPaperWhiteStructure(elements))
        return "shape";
    if (elements.some((el) => el.elementType === "image" && Boolean(el.src))) {
        return "image";
    }
    if (elements.some((el) => el.elementType === "table"))
        return "table";
    if (elements.some((el) => el.elementType === "chart"))
        return "chart";
    const big = elements.filter((el) => el.elementType === "shape" && area(el) >= 200 * 140);
    if (big.length >= 1)
        return "shape";
    return null;
}
/** Three equal-width plates — the stamp the skill forbids as a default. */
export function hasThreePlates(elements) {
    const rects = elements.filter((el) => {
        if (el.elementType !== "shape")
            return false;
        const [, , w, h] = el.bounds;
        return w >= 220 && w <= 340 && h >= 180;
    });
    return rects.length >= 3;
}
function collectImageSrcs(page) {
    const srcs = [];
    if (page.background?.type === "image" && page.background.src) {
        srcs.push(page.background.src);
    }
    for (const el of page.elements) {
        if (el.elementType !== "image")
            continue;
        const src = el.src;
        if (src)
            srcs.push(src);
    }
    return srcs;
}
const SUPPORTED_CHART_TYPES = new Set([
    "bar",
    "column",
    "line",
    "area",
    "pie",
    "waterfall",
    "scatter",
]);
function chartIssues(page) {
    const issues = [];
    for (const element of page.elements) {
        if (element.elementType !== "chart")
            continue;
        const chart = element;
        const type = String(chart.series[0]?.type ?? "bar").toLowerCase();
        if (!SUPPORTED_CHART_TYPES.has(type)) {
            issues.push({
                pageId: page.id,
                code: "unsupported_chart",
                message: `page ${page.id} chart ${chart.elementId} uses unsupported type ${type}`,
            });
            continue;
        }
        if (type !== "scatter" && type !== "waterfall")
            continue;
        const encode = chart.series[0]?.encode;
        const xName = encode?.x;
        const yName = encode?.y;
        const xIndex = xName ? chart.data.cols.indexOf(xName) : -1;
        const yIndex = yName ? chart.data.cols.indexOf(yName) : -1;
        const hasNumericRows = xIndex >= 0 &&
            yIndex >= 0 &&
            chart.data.rows.some((row) => Number.isFinite(Number(row[yIndex])) && (type === "waterfall" || Number.isFinite(Number(row[xIndex]))));
        if (xIndex < 0 || yIndex < 0 || xIndex === yIndex || !hasNumericRows) {
            issues.push({
                pageId: page.id,
                code: "invalid_chart_data",
                message: `page ${page.id} chart ${chart.elementId} must encode distinct existing x/y columns with numeric rows for ${type}`,
            });
        }
    }
    return issues;
}
const HEX_RE = /#([0-9A-Fa-f]{6})\b/g;
/** Cream / white / gray / near-black — a Google-Doc wall, not courseware. */
const COURSEWARE_HEX = new Set(["#44712E", "#F5987E", "#D7EBCE", "#F9DED8", "#56687A"].map((h) => h.toUpperCase()));
export function isNeutralHex(hex) {
    const h = hex.replace("#", "").toUpperCase();
    if (COURSEWARE_HEX.has(`#${h}`))
        return false;
    if (h.length !== 6)
        return true;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (sat < 0.14)
        return true;
    if (lum > 0.9 && sat < 0.28)
        return true;
    return false;
}
export function collectPageHexes(page) {
    const found = new Set();
    const blob = JSON.stringify(page);
    for (const m of blob.matchAll(HEX_RE)) {
        found.add(`#${m[1].toUpperCase()}`);
    }
    return [...found];
}
export function hasCoursewareColor(page) {
    return collectPageHexes(page).some((hex) => !isNeutralHex(hex));
}
export function coursewarePageIssues(page, opts) {
    const issues = [];
    const shapes = page.elements.filter((el) => el.elementType === "shape");
    if (hasHomemadeFourCircles(page.elements) || hasKidsDoodle(page.elements)) {
        issues.push({
            pageId: page.id,
            code: "homemade",
            message: `page ${page.id} used homemade 4-step circles or a soil/sun doodle — use the official paper-white list/tool or cover recipe`,
        });
    }
    const exhibitKind = detectExhibit(page.elements);
    if (!hasCoursewareColor(page) && exhibitKind !== "chart" && exhibitKind !== "table" && exhibitKind !== "image") {
        issues.push({
            pageId: page.id,
            code: "no_color",
            message: `page ${page.id} is cream/black only — use courseware green #44712E, coral #F5987E, or a supporting fill`,
        });
    }
    if (!pageText(page.elements).trim()) {
        issues.push({
            pageId: page.id,
            code: "doc_wall",
            message: `page ${page.id} has no readable copy — empty color boxes are not a lesson`,
        });
    }
    const official = hasPaperWhiteStructure(page.elements);
    if (opts.body && !official && !detectExhibit(page.elements)) {
        issues.push({
            pageId: page.id,
            code: "no_exhibit",
            message: `page ${page.id} has no official recipe or exhibit (list panels / result bar / large shape / table / chart).`,
        });
    }
    if (opts.body && !official && !hasDrawnExhibit(page.elements)) {
        issues.push({
            pageId: page.id,
            code: "empty_box",
            message: `page ${page.id} is cards+copy or an empty panel — use paper-white list/tool, editorial columns, or a result bar`,
        });
    }
    if (!opts.body && shapes.length === 0) {
        issues.push({
            pageId: page.id,
            code: "doc_wall",
            message: `page ${page.id} cover/close needs a colored shape panel, not a wall of black text`,
        });
    }
    if (opts.body &&
        shapes.length === 0 &&
        !page.elements.some((el) => el.elementType === "table" || el.elementType === "chart")) {
        issues.push({
            pageId: page.id,
            code: "doc_wall",
            message: `page ${page.id} is text-only — draw the exhibit with shapes`,
        });
    }
    return issues;
}
export function hasUnlabeledStat(text, researchHadGap) {
    if (!researchHadGap)
        return false;
    const hasStat = /人均|[¥￥$€]\s*\d|\d{2,}\s*(?:元|万|亿|人|次|分钟)|(?:\d{1,3}(?:\.\d+)?\s*%)/.test(text);
    if (!hasStat)
        return false;
    return !/占位|示意|待补|课堂练习|不是统计/.test(text);
}
export function reviewSkillPages(pages, opts = {}) {
    const mode = opts.mode ?? "strict";
    const issues = [];
    const last = Math.max(0, pages.length - 1);
    const summaries = [];
    for (const [i, page] of pages.entries()) {
        const coverage = pageCoverage(page.elements);
        const exhibit = detectExhibit(page.elements);
        const imageSrcs = collectImageSrcs(page);
        summaries.push({ id: page.id, coverage, exhibit, imageSrcs });
        issues.push(...chartIssues(page));
        issues.push(...requestedExhibitIssues(page, opts.todos?.[i]));
        if (!pageHasVisibleContent(page)) {
            issues.push({
                pageId: page.id,
                code: "empty",
                message: `page ${page.id} has no visible text, table body values, or chart series — a full-bleed shape is empty (coverage ${coverage.toFixed(2)} is not content)`,
            });
        }
        if (isCloserPage(page, i, last) && !pageHasReadableCopy(page)) {
            issues.push({
                pageId: page.id,
                code: "empty",
                message: `page ${page.id} closer has no readable copy — write a 结束页 with title, one-line recap, and next-month ask; empty navy is not a closer`,
            });
        }
        issues.push(...tableEmptyCellIssues(page));
        issues.push(...pageGeometryIssues(page));
        if (mode === "strict" && isBody(page, i, last) && !exhibit) {
            issues.push({
                pageId: page.id,
                code: "no_exhibit",
                message: `page ${page.id} has no main exhibit (image/table/chart/one large shape)`,
            });
        }
        if (mode === "strict" && isBody(page, i, last) && hasThreePlates(page.elements)) {
            issues.push({
                pageId: page.id,
                code: "three_plates",
                message: `page ${page.id} is title + three plates — not a main exhibit`,
            });
        }
        if (hasUnlabeledStat(pageText(page.elements), Boolean(opts.researchHadGap))) {
            issues.push({
                pageId: page.id,
                code: "unlabeled_stat",
                message: `page ${page.id} has numbers after a research gap — mark 占位/示意/待补`,
            });
        }
        if (opts.courseware) {
            issues.push(...coursewarePageIssues(page, { body: isCoursewareExhibitPage(page, i, last) }));
        }
        if (opts.projectRoot) {
            for (const src of imageSrcs) {
                if (!mediaExists(opts.projectRoot, src)) {
                    issues.push({
                        pageId: page.id,
                        code: "missing_media",
                        message: `page ${page.id} chose an image src ${src} that is not on disk — generate_image or drop the image element`,
                    });
                }
            }
        }
    }
    return {
        ok: issues.length === 0,
        visualQa: "skipped",
        issues,
        pages: summaries,
    };
}
//# sourceMappingURL=layout-qa.js.map