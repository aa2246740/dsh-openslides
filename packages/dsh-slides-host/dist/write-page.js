import fs from "node:fs";
import path from "node:path";
import { isCanonicalWritePageArgs, loadProject } from "@open-slidestudio/pptd-v2";
import { parseSkillPage, countRawChartElements, DROPPED_CHART_DETAIL, persistPageKey, stableSha256, writePageSchemaIssues, writePageSchemaError, EMPTY_CLOSER_PRODUCE_NEXT, backgroundColorWriteAuthority, listSourceReceipts, packColorWriteContextFrom, } from "@open-slidestudio/presentation-run";
import { readSliceRuntimeFile } from "./runtime.js";
function asRecord(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return undefined;
}
function asBool(value) {
    if (typeof value === "boolean")
        return value;
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    return undefined;
}
/**
 * MiniMax (and some JSON-schema tool wrappers) send arrays as `{ item: T }`.
 * Host only unwraps; it does not invent copy.
 */
export function unwrapToolValue(value, depth = 0) {
    if (depth > 8)
        return value;
    if (Array.isArray(value))
        return value.map((item) => unwrapToolValue(item, depth + 1));
    const rec = asRecord(value);
    if (!rec)
        return value;
    const keys = Object.keys(rec);
    if (keys.length === 1 && keys[0] === "item") {
        return unwrapToolValue(rec.item, depth + 1);
    }
    const next = {};
    for (const [key, nested] of Object.entries(rec)) {
        next[key] = unwrapToolValue(nested, depth + 1);
    }
    return next;
}
function coerceBounds(raw) {
    if (!Array.isArray(raw) || raw.length < 4)
        return undefined;
    const nums = raw.slice(0, 4).map((n) => {
        if (typeof n === "number" && Number.isFinite(n))
            return n;
        if (typeof n === "string" && n.trim() && Number.isFinite(Number(n)))
            return Number(n);
        return undefined;
    });
    if (nums.some((n) => n === undefined))
        return undefined;
    return nums;
}
/**
 * Flatten Gemini `{ rect, value }` and MiniMax `{ item: [...] }` dialects
 * into the fields parseSkillPage already accepts. Host does not invent copy.
 */
export function normalizeWritePageArgs(args) {
    const unwrapped = unwrapToolValue(args);
    if (!Array.isArray(unwrapped.elements))
        return unwrapped;
    return {
        ...unwrapped,
        elements: unwrapped.elements.map(normalizeWritePageElement),
    };
}
export function normalizeWritePageElement(raw) {
    const rec = asRecord(unwrapToolValue(raw));
    if (!rec)
        return raw;
    const value = asRecord(rec.value);
    const rect = asRecord(rec.rect);
    const merged = { ...(value ?? {}), ...rec };
    delete merged.value;
    const fromRect = rect && merged.bounds == null && merged.position == null
        ? [rect.left ?? rect.x, rect.top ?? rect.y, rect.width ?? rect.w, rect.height ?? rect.h]
        : undefined;
    const bounds = coerceBounds(merged.bounds) ?? coerceBounds(merged.position) ?? coerceBounds(fromRect);
    if (bounds)
        merged.bounds = bounds;
    const isBold = asBool(merged.isBold);
    if (isBold === true && merged.fontWeight == null)
        merged.fontWeight = "bold";
    const content = asRecord(merged.content) ?? {};
    const bold = asBool(content.bold) ?? asBool(merged.bold) ?? isBold;
    if (typeof merged.text === "string" && content.text == null) {
        merged.content = {
            ...content,
            text: merged.text,
            ...(typeof merged.fontSize === "number" || typeof merged.fontSize === "string"
                ? { fontSize: merged.fontSize }
                : {}),
            ...(bold === true ? { bold: true } : {}),
            ...(typeof merged.color === "string" ? { color: merged.color } : {}),
        };
    }
    else if (bold === true && content.bold !== true) {
        merged.content = { ...content, bold: true };
    }
    if (merged.elementType === "chart" || merged.data != null || merged.series != null) {
        delete merged.xAxis;
        delete merged.yAxis;
        delete merged.dataLabels;
        if (Array.isArray(merged.series)) {
            for (const series of merged.series) {
                const row = asRecord(series);
                if (row)
                    delete row.dataLabels;
            }
        }
        if (typeof merged.legend === "string") {
            const flag = asBool(merged.legend);
            if (flag !== undefined)
                merged.legend = flag;
            else
                delete merged.legend;
        }
        else if (Array.isArray(merged.legend)) {
            merged.legend = true;
        }
        if (merged.title != null && typeof merged.title !== "string") {
            const title = asRecord(merged.title);
            if (title && typeof title.text === "string")
                merged.title = { text: title.text };
            else
                delete merged.title;
        }
    }
    return merged;
}
export function pageBodySha256(page) {
    return stableSha256(page);
}
function imageSrcsFromLoadedPages(pages) {
    const rows = [];
    for (const loaded of pages) {
        const rec = loaded.page;
        const pageId = path.basename(loaded.path, ".page") ||
            (typeof rec.id === "string" ? rec.id.trim() : "");
        if (!pageId)
            continue;
        for (const el of loaded.page.elements) {
            if (el.elementType === "image" && typeof el.src === "string" && el.src) {
                rows.push({ pageId, src: el.src });
            }
        }
    }
    return rows;
}
function backgroundColorsFromLoadedPages(pages) {
    const rows = [];
    for (const loaded of pages) {
        if (loaded.page.background?.type !== "solid")
            continue;
        rows.push({
            pageId: path.basename(loaded.path, ".page"),
            color: loaded.page.background.color,
        });
    }
    return rows;
}
function packColorContextFromProject(projectRoot) {
    const adoptedSourceIds = [];
    let designSystemId;
    try {
        const rec = readSliceRuntimeFile(projectRoot);
        if (typeof rec.designSystemId === "string" && rec.designSystemId.trim()) {
            designSystemId = rec.designSystemId.trim();
        }
    }
    catch {
        designSystemId = undefined;
    }
    try {
        for (const row of listSourceReceipts(projectRoot)) {
            if (row.state === "adopted" || row.state === "executed")
                adoptedSourceIds.push(row.sourceId);
        }
    }
    catch {
        /* receipts are optional until commit_design */
    }
    return packColorWriteContextFrom({ designSystemId, adoptedSourceIds });
}
export function readWritePageDisk(projectRoot) {
    try {
        if (!fs.existsSync(path.join(projectRoot, "deck.pptd")))
            return undefined;
        const project = loadProject(projectRoot);
        const last = project.pages.at(-1);
        return {
            projectRoot,
            pageCount: project.pages.length,
            lastBasename: last ? path.basename(last.path, ".page") : undefined,
            theme: project.presentation.theme,
            imageSrcs: imageSrcsFromLoadedPages(project.pages),
            backgroundColors: backgroundColorsFromLoadedPages(project.pages),
            ...packColorContextFromProject(projectRoot),
        };
    }
    catch {
        return undefined;
    }
}
export function decideWritePage(args, current, disk) {
    const normalizedArgs = isCanonicalWritePageArgs(args)
        ? structuredClone(args)
        : normalizeWritePageArgs(args);
    const parsed = parseSkillPage(normalizedArgs, 0);
    if (!parsed?.id) {
        return {
            action: "reject",
            outcome: { outcome: "rejected", detail: "invalid page" },
        };
    }
    const rawCharts = countRawChartElements(normalizedArgs.elements);
    const keptCharts = parsed.elements.filter((el) => el.elementType === "chart").length;
    if (rawCharts > keptCharts) {
        return {
            action: "reject",
            outcome: { outcome: "rejected", detail: DROPPED_CHART_DETAIL },
        };
    }
    const siblingImageSrcs = (disk?.imageSrcs ?? []).filter((row) => persistPageKey(row.pageId) !== persistPageKey(parsed.id));
    const persistedBackgroundColor = disk?.backgroundColors?.find((row) => persistPageKey(row.pageId) === persistPageKey(parsed.id))?.color;
    const schemaCtx = {
        lastDiskBasename: disk?.lastBasename,
        diskPageCount: disk?.pageCount,
        theme: disk?.theme,
        adoptedPackId: disk?.adoptedPackId,
        adoptedPackHexes: disk?.adoptedPackHexes,
        otherPackHexes: disk?.otherPackHexes,
        ...backgroundColorWriteAuthority({
            projectRoot: disk?.projectRoot,
            pageId: parsed.id,
            persistedBackgroundColor,
        }),
        ...(siblingImageSrcs.length ? { siblingImageSrcs } : {}),
    };
    const schemaError = writePageSchemaError(writePageSchemaIssues(parsed, schemaCtx, normalizedArgs), parsed, schemaCtx);
    if (schemaError) {
        return {
            action: "reject",
            outcome: {
                outcome: "rejected",
                detail: schemaError.error === "empty_closer"
                    ? `empty_closer: ${EMPTY_CLOSER_PRODUCE_NEXT}`
                    : `${schemaError.error}: ${schemaError.detail}`,
            },
        };
    }
    const pageSha256 = pageBodySha256(parsed);
    if (current && current.pageSha256 === pageSha256) {
        if (!current.yamlExists) {
            return {
                action: "reject",
                outcome: {
                    outcome: "rejected",
                    detail: `ledger-file-mismatch for ${parsed.id}`,
                },
            };
        }
        if (current.lastVerdict === "revise") {
            return {
                action: "reject",
                outcome: {
                    outcome: "revise-requires-change",
                    pageId: parsed.id,
                    revision: current.revision,
                    pageSha256,
                },
            };
        }
        return {
            action: "skip",
            outcome: {
                outcome: "skipped-identical",
                pageId: parsed.id,
                revision: current.revision,
                pageSha256,
            },
        };
    }
    return { action: "write", pageId: parsed.id, pageSha256 };
}
//# sourceMappingURL=write-page.js.map