import { SUPPORTED_SHAPE_NAMES } from "./shape-catalog.js";
const string = (description) => ({ type: "string", ...(description ? { description } : {}) });
const number = (description) => ({ type: "number", ...(description ? { description } : {}) });
const boolean = (description) => ({ type: "boolean", ...(description ? { description } : {}) });
const array = (items, description) => ({ type: "array", items, ...(description ? { description } : {}) });
const tuple = (items, length, description) => ({ ...array(items, description), minItems: length, maxItems: length });
const object = (properties, additionalProperties = false, description) => ({ type: "object", properties, additionalProperties, ...(description ? { description } : {}) });
const oneOf = (...branches) => ({ oneOf: branches });
const required = (schema) => ({ ...schema, required: true });
const color = string("Official #RRGGBB/#RRGGBBAA or an adopted Theme.colors $token.");
const finiteNumberArray = array(number());
const bounds = tuple(number(), 4, "Exactly [x,y,width,height]; all values finite and width/height positive.");
const alignment = tuple(string(), 2, "Exactly [horizontal,vertical].");
const fit = object({ mode: required({ type: "string", enum: ["fill", "contain", "cover"] }) });
const imageCrop = object({ left: number(), top: number(), right: number(), bottom: number() });
const supportedShapeName = {
    type: "string",
    enum: SUPPORTED_SHAPE_NAMES,
    description: "Use an official SHAPE_CATALOG name (for example rect, roundRect, ellipse, triangle). Accepted alias: rectangle means rect. Unknown names are rejected for new writes.",
};
const shapeDef = object({ shapeName: required(supportedShapeName), adjustments: finiteNumberArray });
const gradientStop = object({ position: required(number()), color: required(color) });
const solidFill = object({ type: required({ type: "string", const: "solid" }), color: required(color) });
const gradientFill = object({
    type: required({ type: "string", const: "gradient" }),
    gradientType: required({ type: "string", enum: ["linear", "radial"] }),
    stops: required(array(gradientStop)),
    angle: number(),
});
const imageFill = object({
    type: required({ type: "string", const: "image" }),
    src: required(string()),
    fit,
    opacity: number(),
});
const fill = oneOf(solidFill, gradientFill, imageFill);
const border = object({ style: string(), width: number(), color });
const shadow = object({ blur: number(), color, offsetX: number(), offsetY: number() });
const smartArt = object({
    id: required(string()),
    layout: required({ type: "string", enum: ["process", "cycle", "hierarchy"] }),
    role: required({ type: "string", enum: ["node", "label", "connector"] }),
    index: { type: "integer" },
    pinned: boolean(),
});
const baseProperties = {
    elementId: required(string("Stable id unique within the page.")),
    bounds: required(bounds),
    rotation: number(),
    opacity: number(),
    flipH: boolean(),
    flipV: boolean(),
    locked: boolean(),
    hidden: boolean(),
    groupId: string(),
    shadow,
    layoutRole: { type: "string", enum: ["footer", "content", "decoration"] },
    exhibitRole: {
        type: "string",
        enum: ["funnel", "gauge", "pyramid", "matrix", "timeline", "kpi-card", "comparison-card"],
    },
    smartArt,
};
const textContent = object({
    text: required(string('Plain or rich-text HTML string. Quote numeric labels too: "1", "2", "3". Inline CSS belongs only inside this string.')),
    style: string("Theme text-style reference such as $title. Never pass a style object here."),
    color,
    fontSize: number("Font size belongs directly on content."),
    fontFamily: oneOf(string("Only a common Office face: 微软雅黑, 黑体, 宋体, 楷体, 仿宋, Arial, Times New Roman, Georgia, Verdana, Tahoma, Courier New. Any other name is rewritten to the closest one and reported back."), object({
        latin: required(string("Latin face from the same list.")),
        ea: required(string("East Asian face from the same list.")),
    })),
    bold: boolean(),
    italic: boolean(),
    underline: boolean(),
    backgroundColor: color,
    lineHeight: number(),
    letterSpacing: number(),
    align: alignment,
    wrap: boolean(),
    list: { type: "string", enum: ["bullet", "number"] },
    href: string(),
});
const tableCell = object({
    text: string(),
    bold: boolean(),
    color,
    fill,
    align: alignment,
    rowSpan: { type: "integer" },
    colSpan: { type: "integer" },
});
const chartScalar = oneOf(number(), string(), { type: "null" });
const chartData = object({
    cols: required(array(string())),
    rows: required(array(array(chartScalar))),
});
const chartSeries = object({
    type: required(string()),
    name: string(),
    encode: object({}, true),
    fill: oneOf(string(), gradientFill),
    axis: { type: "string", enum: ["primary", "secondary"] },
});
const chartAxis = object({ x: string(), y: string(), secondaryY: string() });
const lineArrow = oneOf({
    type: "string",
    enum: ["arrow", "stealth", "diamond", "oval", "none", "null", ""],
    description: "Use JSON null for no head. The string \"null\", none, or {} are accepted and stored as no head.",
}, { type: "null" }, object({}, false, "Empty object means no arrow head."));
const animation = object({
    elementId: required(string()),
    effect: required(string()),
    trigger: string(),
    direction: string(),
    durationMs: number(),
    delayMs: number(),
});
/** Canonical native PPTD element contract shared by whole-page and scoped edits. */
export const PPTD_ELEMENT_PARAMETER_SPEC = oneOf(object({
    ...baseProperties,
    elementType: required({ type: "string", const: "text" }),
    content: required(textContent),
}), object({
    ...baseProperties,
    elementType: required({ type: "string", const: "shape" }),
    shapeName: required(supportedShapeName),
    fill,
    border,
    adjustments: finiteNumberArray,
}), object({
    ...baseProperties,
    elementType: required({ type: "string", const: "image" }),
    src: required(string()),
    fit,
    crop: imageCrop,
    cropShape: shapeDef,
}), object({
    ...baseProperties,
    elementType: required({ type: "string", const: "table" }),
    columnWidths: required(finiteNumberArray),
    rowHeights: finiteNumberArray,
    rows: required(array(array(tableCell))),
}), object({
    ...baseProperties,
    elementType: required({ type: "string", const: "chart" }),
    data: required(chartData),
    series: required(array(chartSeries)),
    colors: array(color),
    background: fill,
    title: oneOf(string(), object({ text: required(string()) })),
    legend: oneOf(boolean(), object({}, true)),
    labels: boolean(),
    axis: chartAxis,
}), object({
    ...baseProperties,
    elementType: required({ type: "string", const: "icon" }),
    iconName: required(string()),
    fill,
}), object({
    ...baseProperties,
    elementType: required({ type: "string", const: "line" }),
    viewBox: required(tuple(number(), 2, "Exactly two numbers [width,height], for example [300,120]. Do not use the four-number SVG viewBox form.")),
    points: required(string()),
    border,
    curve: string(),
    arrow: tuple(lineArrow, 2),
    connects: tuple(string(), 2),
    label: string(),
}));
/**
 * Single model-facing shape contract for generated PPTD pages. It deliberately
 * uses the dsh-tools author schema subset without importing the DSH runtime.
 */
export const WRITE_PAGE_PARAMETER_SPEC = {
    id: required(string()),
    pageType: string(),
    background: fill,
    notes: string(),
    elements: required(array(PPTD_ELEMENT_PARAMETER_SPEC, "A non-empty complete-page replacement using canonical PPTD v2 elements.")),
    animations: array(animation),
    expectedPageSha256: string("pageSha256 returned by read_page when replacing an editor-locked existing page."),
};
/** Element-scoped edit contract. The array contains only the authorized target
 * elements, but every item is a complete canonical native PPTD element. */
export const EDIT_ELEMENTS_PARAMETER_SPEC = {
    pageId: required(string("Existing PPTD page id. Must match the active editor element scope.")),
    expectedPageSha256: required(string("Current pageSha256 returned by read_page.")),
    elements: required(array(PPTD_ELEMENT_PARAMETER_SPEC, "Complete replacements for exactly the authorized target elementIds.")),
};
/** Compile the shared specification to standard JSON Schema. DSH's author DSL
 * drops array cardinality keywords, so publish this lossless form to providers. */
export function writePageJsonSchema() {
    function compile(schema) {
        const { required: _required, ...node } = schema;
        if ("oneOf" in node)
            return { ...node, oneOf: node.oneOf.map(compile) };
        if (node.type === "array")
            return { ...node, ...(node.items ? { items: compile(node.items) } : {}) };
        if (node.type === "object") {
            const entries = Object.entries(node.properties ?? {});
            const requiredFields = entries.filter(([, child]) => child.required).map(([key]) => key);
            return {
                ...node,
                properties: Object.fromEntries(entries.map(([key, child]) => [key, compile(child)])),
                ...(requiredFields.length ? { required: requiredFields } : {}),
            };
        }
        return node;
    }
    return compile(object(WRITE_PAGE_PARAMETER_SPEC));
}
export function editElementsJsonSchema() {
    function compile(schema) {
        const { required: _required, ...node } = schema;
        if ("oneOf" in node)
            return { ...node, oneOf: node.oneOf.map(compile) };
        if (node.type === "array")
            return { ...node, ...(node.items ? { items: compile(node.items) } : {}) };
        if (node.type === "object") {
            const entries = Object.entries(node.properties ?? {});
            const requiredFields = entries.filter(([, child]) => child.required).map(([key]) => key);
            return {
                ...node,
                properties: Object.fromEntries(entries.map(([key, child]) => [key, compile(child)])),
                ...(requiredFields.length ? { required: requiredFields } : {}),
            };
        }
        return node;
    }
    return compile(object(EDIT_ELEMENTS_PARAMETER_SPEC));
}
function record(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null
        ? value
        : undefined;
}
function receivedType(value) {
    if (value === null)
        return "null";
    if (Array.isArray(value))
        return "array";
    return typeof value;
}
function typeIssue(path, expected, value) {
    // Report only the JSON type. Echoing arbitrary string/object contents can
    // leak page copy into logs, and including primitive values would split the
    // same normalized ToolInvalidArgsLoopGuard fingerprint (for example 1/2/3).
    return `${path} must be ${expected} (received ${receivedType(value)})`;
}
function schemaIssues(schema, value, path) {
    if ("oneOf" in schema) {
        const results = schema.oneOf.map((branch) => schemaIssues(branch, value, path));
        const matches = results.filter((issues) => issues.length === 0);
        if (matches.length === 1)
            return [];
        if (matches.length > 1)
            return [`${path} matches more than one schema branch`];
        const discriminant = record(value)?.elementType;
        if (typeof discriminant === "string") {
            const branch = schema.oneOf.find((candidate) => {
                if (!("type" in candidate) || candidate.type !== "object")
                    return false;
                const property = candidate.properties?.elementType;
                return property && "const" in property && property.const === discriminant;
            });
            if (branch)
                return schemaIssues(branch, value, path);
        }
        return [`${path} does not match any schema branch`];
    }
    if (schema.type === "null")
        return value === null ? [] : [typeIssue(path, "null", value)];
    if (schema.type === "string") {
        if (typeof value !== "string")
            return [typeIssue(path, "a string", value)];
        if (schema.const !== undefined && value !== schema.const)
            return [`${path} must equal ${schema.const}`];
        if (schema.enum && !schema.enum.includes(value))
            return [`${path} must be one of ${schema.enum.join(", ")}`];
        return [];
    }
    if (schema.type === "number" || schema.type === "integer") {
        if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
            return [typeIssue(path, `a finite JSON ${schema.type}`, value)];
        }
        if (schema.type === "integer" && !Number.isInteger(value)) {
            return [typeIssue(path, "an integer", value)];
        }
        return [];
    }
    if (schema.type === "boolean") {
        return typeof value === "boolean" ? [] : [typeIssue(path, "a boolean", value)];
    }
    if (schema.type === "array") {
        if (!Array.isArray(value))
            return [typeIssue(path, "an array", value)];
        if (!schema.items)
            return [];
        return value.flatMap((item, index) => schemaIssues(schema.items, item, `${path}[${index}]`));
    }
    const candidate = record(value);
    if (!candidate)
        return [typeIssue(path, "an object", value)];
    const properties = schema.properties ?? {};
    const issues = [];
    for (const [key, property] of Object.entries(properties)) {
        if (property.required && !Object.hasOwn(candidate, key))
            issues.push(`${path}.${key} is required`);
        if (Object.hasOwn(candidate, key))
            issues.push(...schemaIssues(property, candidate[key], `${path}.${key}`));
    }
    if (!schema.additionalProperties) {
        for (const key of Object.keys(candidate)) {
            if (!Object.hasOwn(properties, key))
                issues.push(`${path}.${key} is not allowed`);
        }
    }
    return issues;
}
function semanticIssues(args) {
    const issues = [];
    const checkFill = (candidate, path) => {
        if (typeof candidate !== "string" && candidate?.type === "gradient" && candidate.stops.length === 0) {
            issues.push(`${path}.stops must not be empty`);
        }
    };
    if (!args.id.trim())
        issues.push("$.id must not be empty");
    if (args.elements.length === 0)
        issues.push("$.elements must not be empty");
    checkFill(args.background, "$.background");
    const ids = new Set();
    for (const [index, element] of args.elements.entries()) {
        const path = `$.elements[${index}]`;
        if (!element.elementId.trim())
            issues.push(`${path}.elementId must not be empty`);
        else if (ids.has(element.elementId))
            issues.push(`${path}.elementId must be unique`);
        else
            ids.add(element.elementId);
        if (element.bounds.length !== 4)
            issues.push(`${path}.bounds must contain exactly 4 numbers`);
        else if (element.bounds[2] <= 0 || element.bounds[3] <= 0)
            issues.push(`${path}.bounds width and height must be positive`);
        if (element.elementType === "text") {
            const text = element;
            if (text.content.align && text.content.align.length !== 2) {
                issues.push(`${path}.content.align must contain exactly 2 strings`);
            }
        }
        if (element.elementType === "line") {
            const line = element;
            if (line.viewBox.length !== 2)
                issues.push(`${path}.viewBox must contain exactly 2 numbers`);
            if (line.arrow && line.arrow.length !== 2)
                issues.push(`${path}.arrow must contain exactly 2 values`);
            if (line.connects && line.connects.length !== 2)
                issues.push(`${path}.connects must contain exactly 2 ids`);
        }
        if (element.elementType === "table") {
            const table = element;
            if (table.columnWidths.length === 0)
                issues.push(`${path}.columnWidths must not be empty`);
            for (const [columnIndex, width] of table.columnWidths.entries()) {
                if (width <= 0)
                    issues.push(`${path}.columnWidths[${columnIndex}] must be positive`);
            }
            if (table.rows.length === 0)
                issues.push(`${path}.rows must not be empty`);
            for (const [rowIndex, row] of table.rows.entries()) {
                if (row.length !== table.columnWidths.length) {
                    issues.push(`${path}.rows[${rowIndex}] must match columnWidths length`);
                }
                for (const [cellIndex, cell] of row.entries()) {
                    if (cell.rowSpan !== undefined && cell.rowSpan < 1) {
                        issues.push(`${path}.rows[${rowIndex}][${cellIndex}].rowSpan must be at least 1`);
                    }
                    if (cell.colSpan !== undefined && cell.colSpan < 1) {
                        issues.push(`${path}.rows[${rowIndex}][${cellIndex}].colSpan must be at least 1`);
                    }
                    if (cell.align && cell.align.length !== 2) {
                        issues.push(`${path}.rows[${rowIndex}][${cellIndex}].align must contain exactly 2 strings`);
                    }
                    checkFill(cell.fill, `${path}.rows[${rowIndex}][${cellIndex}].fill`);
                }
            }
            if (table.rowHeights && table.rowHeights.length !== table.rows.length) {
                issues.push(`${path}.rowHeights must match rows length`);
            }
            for (const [rowIndex, height] of (table.rowHeights ?? []).entries()) {
                if (height <= 0)
                    issues.push(`${path}.rowHeights[${rowIndex}] must be positive`);
            }
        }
        if (element.elementType === "chart") {
            const chart = element;
            if (chart.data.cols.length === 0)
                issues.push(`${path}.data.cols must not be empty`);
            if (chart.data.rows.length === 0)
                issues.push(`${path}.data.rows must not be empty`);
            for (const [rowIndex, row] of chart.data.rows.entries()) {
                if (row.length !== chart.data.cols.length) {
                    issues.push(`${path}.data.rows[${rowIndex}] must match data.cols length`);
                }
            }
            if (chart.series.length === 0)
                issues.push(`${path}.series must not be empty`);
            for (const [seriesIndex, series] of chart.series.entries()) {
                for (const [key, value] of Object.entries(series.encode ?? {})) {
                    if (typeof value !== "string") {
                        issues.push(typeIssue(`${path}.series[${seriesIndex}].encode.${key}`, "a string", value));
                    }
                }
                checkFill(series.fill, `${path}.series[${seriesIndex}].fill`);
            }
        }
        if (element.elementType === "shape")
            checkFill(element.fill, `${path}.fill`);
        if (element.elementType === "icon")
            checkFill(element.fill, `${path}.fill`);
        if (element.elementType === "chart")
            checkFill(element.background, `${path}.background`);
    }
    return issues;
}
/** Validate structure and the tuple/non-empty rules outside DSH's JSON Schema subset. */
export function canonicalWritePageIssues(value) {
    const root = record(value);
    if (!root)
        return [typeIssue("$", "an object", value)];
    const rootSchema = object(WRITE_PAGE_PARAMETER_SPEC);
    const issues = schemaIssues(rootSchema, value, "$");
    if (issues.length)
        return issues;
    return semanticIssues(value);
}
/** Validate the closed scoped-edit root and every complete native element. */
export function canonicalEditElementsIssues(value) {
    const root = record(value);
    if (!root)
        return [typeIssue("$", "an object", value)];
    const rootSchema = object(EDIT_ELEMENTS_PARAMETER_SPEC);
    const issues = schemaIssues(rootSchema, value, "$");
    if (issues.length)
        return issues;
    const args = value;
    const semantic = semanticIssues({ id: args.pageId, elements: args.elements });
    if (!/^[a-f0-9]{64}$/i.test(args.expectedPageSha256.trim())) {
        semantic.push("$.expectedPageSha256 must be a 64-character hexadecimal SHA-256");
    }
    return semantic;
}
export function isCanonicalEditElementsArgs(value) {
    return canonicalEditElementsIssues(value).length === 0;
}
export function isCanonicalWritePageArgs(value) {
    return canonicalWritePageIssues(value).length === 0;
}
/** Validate a single Fill value (solid/gradient/image) against the write schema. */
export function canonicalFillIssues(value) {
    return schemaIssues(fill, value, "$");
}
/**
 * Validate a text-style patch field by field: only textContent properties are
 * accepted and each must match its declared type. Unlike the full text
 * content object, no key is required — a patch only carries what it changes.
 */
export function canonicalTextStylePatchIssues(patch) {
    const rec = record(patch);
    if (!rec)
        return [typeIssue("$", "an object", patch)];
    const properties = textContent.properties ?? {};
    const issues = [];
    for (const [key, value] of Object.entries(rec)) {
        const spec = properties[key];
        if (!spec) {
            issues.push(`$.${key} is not allowed`);
            continue;
        }
        // null/undefined are the patch protocol's delete markers, not values.
        if (value === null || value === undefined)
            continue;
        issues.push(...schemaIssues(spec, value, `$.${key}`));
    }
    return issues;
}
const LINE_ARROW_NONE = new Set(["", "null", "none", "false"]);
const LINE_ARROW_HEADS = new Set(["arrow", "stealth", "diamond", "oval"]);
/** Models often send the string "null" instead of JSON null for a missing line head. */
export function coerceLineArrowHead(value) {
    if (value === undefined)
        return undefined;
    if (value === null || value === false)
        return null;
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
        return null;
    if (typeof value === "string") {
        const token = value.trim().toLowerCase();
        if (LINE_ARROW_NONE.has(token))
            return null;
        if (LINE_ARROW_HEADS.has(token))
            return token;
    }
    return value;
}
export function normalizeWritePageLineArrows(args) {
    const elements = args.elements;
    if (!Array.isArray(elements))
        return;
    for (const element of elements) {
        if (!element || typeof element !== "object" || Array.isArray(element))
            continue;
        const rec = element;
        if (rec.elementType !== "line" || !Array.isArray(rec.arrow) || rec.arrow.length !== 2)
            continue;
        rec.arrow = [coerceLineArrowHead(rec.arrow[0]), coerceLineArrowHead(rec.arrow[1])];
    }
}
function unwrapXmlTextNode(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return value;
    const rec = value;
    const keys = Object.keys(rec);
    if (keys.length === 1 && keys[0] === "$text" && typeof rec.$text === "string") {
        return rec.$text;
    }
    return value;
}
/** MiniMax and similar adapters wrap strings as { $text: "Microsoft YaHei" }. */
export function normalizeWritePageDialect(args) {
    const walk = (node) => {
        const unwrapped = unwrapXmlTextNode(node);
        if (unwrapped !== node)
            return unwrapped;
        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1)
                node[index] = walk(node[index]);
            return node;
        }
        if (!node || typeof node !== "object")
            return node;
        const rec = node;
        for (const key of Object.keys(rec))
            rec[key] = walk(rec[key]);
        return rec;
    };
    walk(args);
}
//# sourceMappingURL=write-page-schema.js.map