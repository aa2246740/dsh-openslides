import { type Theme } from "@open-slidestudio/pptd-v2";
import { type SkillPageInput } from "@open-slidestudio/presentation-run";
import type { WritePageDecision } from "./protocol.js";
export type WritePageLedgerView = {
    readonly pageId: string;
    readonly revision: number;
    readonly pageSha256: string;
    readonly lastVerdict?: "pass" | "revise";
    readonly yamlExists: boolean;
};
/**
 * MiniMax (and some JSON-schema tool wrappers) send arrays as `{ item: T }`.
 * Host only unwraps; it does not invent copy.
 */
export declare function unwrapToolValue(value: unknown, depth?: number): unknown;
/**
 * Flatten Gemini `{ rect, value }` and MiniMax `{ item: [...] }` dialects
 * into the fields parseSkillPage already accepts. Host does not invent copy.
 */
export declare function normalizeWritePageArgs(args: Record<string, unknown>): Record<string, unknown>;
export declare function normalizeWritePageElement(raw: unknown): unknown;
export declare function pageBodySha256(page: SkillPageInput): string;
export type WritePageDiskView = {
    readonly projectRoot?: string;
    readonly lastBasename?: string;
    readonly pageCount: number;
    readonly theme?: Theme;
    readonly adoptedPackId?: string;
    readonly adoptedPackHexes?: ReadonlySet<string>;
    readonly otherPackHexes?: ReadonlySet<string>;
    readonly imageSrcs?: readonly {
        pageId: string;
        src: string;
    }[];
    readonly backgroundColors?: readonly {
        pageId: string;
        color: string;
    }[];
};
export declare function readWritePageDisk(projectRoot: string): WritePageDiskView | undefined;
export declare function decideWritePage(args: Record<string, unknown>, current: WritePageLedgerView | undefined, disk?: WritePageDiskView): WritePageDecision;
//# sourceMappingURL=write-page.d.ts.map