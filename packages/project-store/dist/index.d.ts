import { createEmptyProject, loadProject, type PptdProject } from "@open-slidestudio/pptd-v2";
export type VersionMeta = {
    id: string;
    label: string;
    createdAt: string;
    note?: string;
    /** Stable request identity tying this before-version to its conversation turn. */
    assistantRequestId?: string;
    assistantOutcome?: "applied" | "restored" | "unchanged";
};
export declare function openOrCreateProject(rootDir: string, opts?: {
    title?: string;
}): PptdProject;
export declare function snapshotVersion(rootDir: string, opts?: {
    label?: string;
    note?: string;
    assistantRequestId?: string;
}): VersionMeta;
export declare function listVersions(rootDir: string): VersionMeta[];
/** Persist an edit artifact only once the verified transaction is closing. */
export declare function recordAssistantVersionOutcome(rootDir: string, versionId: string, outcome: NonNullable<VersionMeta["assistantOutcome"]>): void;
export declare function versionDir(rootDir: string, versionId: string): string;
/** Load a snapshot without mutating the live project. */
export declare function loadVersion(rootDir: string, versionId: string): PptdProject;
export declare function restoreVersion(rootDir: string, versionId: string): void;
export declare function save(project: PptdProject): void;
export { loadProject, createEmptyProject };
//# sourceMappingURL=index.d.ts.map