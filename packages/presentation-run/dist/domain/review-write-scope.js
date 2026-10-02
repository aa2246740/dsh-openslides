import fs from "node:fs";
import path from "node:path";
import { persistPageKey } from "./page-identity.js";
import { stableSha256 } from "./run-ledger.js";
/** Enforce the persisted human target before any page or deck file is written. */
export function reviewWriteScopeViolation(rawScope, pageId, before, proposed) {
    if (!rawScope || typeof rawScope !== "object" || Array.isArray(rawScope))
        return undefined;
    const scope = rawScope;
    const kind = scope.kind;
    if (!["elements", "page", "pages", "deck"].includes(String(kind)))
        return "Invalid persisted review scope";
    const targets = kind === "deck" || kind === "pages" ? scope.targetPageIds : [scope.pageId];
    const pageKey = persistPageKey(pageId);
    if (!Array.isArray(targets) || !targets.some(id => persistPageKey(String(id)) === pageKey) || !before) {
        return `Page ${pageId} is outside the authorized existing pages`;
    }
    if (kind !== "elements")
        return undefined;
    const ids = scope.elementIds;
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== "string" || !id)) {
        return "The persisted element target is missing";
    }
    const allowed = new Set(ids);
    const previous = new Map(before.elements.map(el => [el.elementId, el]));
    if (ids.some(id => !previous.has(id)))
        return "A selected element no longer exists";
    const beforeOrder = before.elements.map(el => el.elementId);
    const afterOrder = proposed.elements.map(el => el.elementId);
    if (stableSha256(beforeOrder) !== stableSha256(afterOrder)) {
        return "Element additions, deletions and layer order changes are outside this element-only edit";
    }
    const { elements: _beforeElements, ...beforeMeta } = before;
    const { elements: _afterElements, ...afterMeta } = proposed;
    if (stableSha256(beforeMeta) !== stableSha256(afterMeta))
        return "Page settings are outside this element-only edit";
    const outside = proposed.elements.filter(el => !allowed.has(el.elementId)
        && stableSha256(previous.get(el.elementId)) !== stableSha256(el)).map(el => el.elementId);
    return outside.length ? `Unselected elements would change: ${outside.join(", ")}` : undefined;
}
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value : undefined;
}
export function readActiveReviewGuard(projectRoot) {
    try {
        const guard = record(JSON.parse(fs.readFileSync(path.join(projectRoot, "_agent", "ai-review-lock.v1.json"), "utf8")));
        const expiresAt = typeof guard?.expiresAt === "number" ? guard.expiresAt : Date.parse(String(guard?.expiresAt ?? ""));
        return guard && Number.isFinite(expiresAt) && expiresAt > Date.now() ? guard : undefined;
    }
    catch {
        return undefined;
    }
}
/** Every writer consumes the same per-page union. Individual comment scopes
 * stay intact in items for completion checks; the legacy head is never used
 * as a fallback when a batch is present. */
export function reviewWriteTargets(rawGuard) {
    const guard = record(rawGuard);
    if (!guard)
        return [];
    const batch = guard.items !== undefined;
    const entries = batch ? guard.items : [guard];
    if (!Array.isArray(entries) || !entries.length)
        return [];
    const byPage = new Map();
    for (const value of entries) {
        const entry = record(value);
        const scope = record(entry?.scope);
        if (!entry || !scope || typeof entry.pagePath !== "string" || typeof scope.pageId !== "string")
            return [];
        const kind = String(scope.kind ?? "");
        if (!(batch ? ["elements", "page"] : ["elements", "page", "pages", "deck"]).includes(kind))
            return [];
        const ids = scope.elementIds;
        if (kind === "elements" && (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== "string" || !id.trim())))
            return [];
        const pageKey = persistPageKey(scope.pageId);
        const previous = byPage.get(pageKey);
        if (previous && previous.pagePath !== entry.pagePath)
            return [];
        const pageBody = record(entry.pageBody);
        const target = {
            pagePath: entry.pagePath,
            scope: { ...scope, ...(kind === "elements" ? { elementIds: [...new Set(ids)] } : {}) },
            ...(pageBody && Array.isArray(pageBody.elements) ? { pageBody: pageBody } : {}),
        };
        if (previous) {
            if (kind === "page" || previous.scope.kind === "page") {
                target.scope = { ...previous.scope, ...scope, kind: "page", elementIds: [] };
            }
            else {
                target.scope.elementIds = [...new Set([...previous.scope.elementIds, ...ids])];
            }
            target.pageBody = previous.pageBody ?? target.pageBody;
        }
        byPage.set(pageKey, target);
    }
    return [...byPage.values()];
}
export function reviewWriteTargetForPage(rawGuard, pageId) {
    const key = persistPageKey(pageId);
    return reviewWriteTargets(rawGuard).find(({ scope }) => scope.kind === "pages" || scope.kind === "deck"
        ? Array.isArray(scope.targetPageIds) && scope.targetPageIds.some(id => persistPageKey(String(id)) === key)
        : persistPageKey(String(scope.pageId)) === key);
}
//# sourceMappingURL=review-write-scope.js.map