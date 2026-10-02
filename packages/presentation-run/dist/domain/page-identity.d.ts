import { type PptdProject } from "@open-slidestudio/pptd-v2";
/** One identity normalization owner. Filenames and historical hashes are not rewritten. */
export declare function persistPageKey(name: string): string;
export declare function persistPagePathFromId(pageId: string): string;
export declare function canonicalPageId(name: string): string;
export declare function canonicalPagePath(name: string): string;
export type PlanPageValidation = {
    readonly ok: true;
    readonly canonicalIds: readonly string[];
} | {
    readonly ok: false;
    readonly reason: string;
    readonly conflicts: readonly Readonly<{
        key: string;
        rawIds: readonly string[];
    }>[];
};
export declare function validatePlanPageIds(pageIds: readonly string[]): PlanPageValidation;
export type ProjectIdentityResolution = {
    readonly kind: "unreadable";
    readonly detail: string;
} | {
    readonly kind: "resolved";
    readonly pages: ReadonlyMap<string, string>;
    readonly aliases: ReadonlyMap<string, string>;
} | {
    readonly kind: "collision";
    readonly conflicts: readonly Readonly<{
        key: string;
        paths: readonly string[];
    }>[];
};
export declare function resolveProjectPageIdentities(projectOrRoot: PptdProject | string): ProjectIdentityResolution;
export type ResolveMutationPathResult = {
    readonly ok: true;
    readonly pagePath: string;
    readonly canonicalId: string;
} | {
    readonly ok: false;
    readonly reason: string;
    readonly code: "PAGE_ID_COLLISION" | "PAGE_NOT_FOUND" | "PROJECT_UNREADABLE";
};
export declare function resolvePagePathForMutation(projectOrRoot: PptdProject | string, targetId: string): ResolveMutationPathResult;
//# sourceMappingURL=page-identity.d.ts.map