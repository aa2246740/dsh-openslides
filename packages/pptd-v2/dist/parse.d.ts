import type { Page, PptdProject } from "./types.js";
export declare class PptdError extends Error {
    constructor(message: string);
}
/** Execute a synchronous multi-file project operation under the PPTD lock. */
export declare function withProjectWriteLock<T>(rootDir: string, action: () => T, opts?: {
    timeoutMs?: number;
}): T;
/**
 * Read a coherent manifest/page snapshot. The lock is shared with every
 * saveProject caller; this is intentionally reentrant for callers that need
 * a read-modify-write transaction.
 */
export declare function loadProject(source: string): PptdProject;
/** Write project back to disk (manifest + all page files). */
export declare function saveProject(project: PptdProject): void;
/** White title-only cover used when a caller lists a page on purpose. */
export declare function titleOnlyCoverPage(title: string): Page;
/** Put a page on the composed list. Does not save. createEmptyProject does not call this. */
export declare function listComposedPage(project: PptdProject, rel: string, page: Page): void;
/** Create a project with zero composed pages. A placeholder file is not a slide. */
export declare function createEmptyProject(rootDir: string, opts?: {
    title?: string;
    size?: [number, number];
}): PptdProject;
/** Calculate the material fingerprint covering deck.pptd, pages, and media. */
export declare function calculateMaterialFingerprint(rootDir: string): string;
//# sourceMappingURL=parse.d.ts.map