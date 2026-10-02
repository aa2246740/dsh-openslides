type PageBody = {
    elements: readonly {
        elementId: string;
    }[];
};
/** Enforce the persisted human target before any page or deck file is written. */
export declare function reviewWriteScopeViolation(rawScope: unknown, pageId: string, before: PageBody | undefined, proposed: PageBody): string | undefined;
type ReviewGuard = Record<string, unknown>;
export type ReviewWriteTarget = {
    pagePath: string;
    scope: Record<string, unknown>;
    pageBody?: PageBody;
};
export declare function readActiveReviewGuard(projectRoot: string): ReviewGuard | undefined;
/** Every writer consumes the same per-page union. Individual comment scopes
 * stay intact in items for completion checks; the legacy head is never used
 * as a fallback when a batch is present. */
export declare function reviewWriteTargets(rawGuard: unknown): ReviewWriteTarget[];
export declare function reviewWriteTargetForPage(rawGuard: unknown, pageId: string): ReviewWriteTarget | undefined;
export {};
//# sourceMappingURL=review-write-scope.d.ts.map