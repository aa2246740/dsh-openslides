import { validatePlanPageIds } from "./page-identity.js";
export const TODO_EXHIBIT_KINDS = [
    "none", "chart:bar", "chart:line", "chart:pie", "chart:waterfall", "chart:scatter", "chart:combo",
    "table", "photo", "diagram:funnel", "diagram:gauge", "diagram:pyramid", "diagram:matrix",
    "diagram:timeline", "kpi-cards", "comparison-cards",
];
const exhibitKinds = new Set(TODO_EXHIBIT_KINDS);
export function isTodoExhibitKind(value) {
    return typeof value === "string" && exhibitKinds.has(value);
}
/** Validate explicit model-authored metadata; never infer a plan from page content. */
export function parseCanonicalPagePlan(raw) {
    if (!Array.isArray(raw) || raw.length === 0)
        throw new Error("a complete page plan must contain at least one page");
    const pages = raw.map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
            throw new Error(`plan[${index}] must be an object`);
        const record = item;
        for (const key of ["pageId", "title", "layoutFamily"]) {
            if (typeof record[key] !== "string" || !record[key].trim())
                throw new Error(`plan[${index}].${key} is required`);
        }
        if (!Array.isArray(record.exhibits) || !record.exhibits.every(isTodoExhibitKind)) {
            throw new Error(`plan[${index}].exhibits must explicitly list supported exhibit kinds, or be empty`);
        }
        if (record.exhibits.includes("none") && record.exhibits.length !== 1)
            throw new Error(`plan[${index}] mixes none with required exhibits`);
        for (const key of ["note", "purpose"]) {
            if (record[key] !== undefined && typeof record[key] !== "string")
                throw new Error(`plan[${index}].${key} must be text`);
        }
        return {
            pageId: record.pageId.trim(), title: record.title.trim(),
            layoutFamily: record.layoutFamily.trim(), exhibits: [...record.exhibits],
            ...(typeof record.note === "string" ? { note: record.note } : {}),
            ...(typeof record.purpose === "string" ? { purpose: record.purpose } : {}),
        };
    });
    const identities = validatePlanPageIds(pages.map((page) => page.pageId));
    if (!identities.ok)
        throw new Error(identities.reason);
    return pages.map((page, index) => ({ ...page, pageId: identities.canonicalIds[index] }));
}
//# sourceMappingURL=page-plan.js.map