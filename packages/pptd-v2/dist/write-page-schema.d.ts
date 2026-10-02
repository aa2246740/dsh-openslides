import type { Animation, Fill, PptdElement } from "./types.js";
type Schema = {
    readonly type: "string";
    readonly enum?: readonly string[];
    readonly const?: string;
    readonly description?: string;
} | {
    readonly type: "number";
    readonly description?: string;
} | {
    readonly type: "integer";
    readonly description?: string;
} | {
    readonly type: "boolean";
    readonly description?: string;
} | {
    readonly type: "null";
    readonly description?: string;
} | {
    readonly type: "array";
    readonly items?: Schema;
    readonly minItems?: number;
    readonly maxItems?: number;
    readonly description?: string;
} | {
    readonly type: "object";
    readonly properties?: PropertyMap;
    readonly additionalProperties: boolean;
    readonly description?: string;
} | {
    readonly oneOf: readonly [Schema, Schema, ...Schema[]];
    readonly description?: string;
};
type Property = Schema & {
    readonly required?: true;
};
type PropertyMap = Readonly<Record<string, Property>>;
/** Canonical native PPTD element contract shared by whole-page and scoped edits. */
export declare const PPTD_ELEMENT_PARAMETER_SPEC: {
    readonly oneOf: [Schema, Schema, ...Schema[]];
};
/**
 * Single model-facing shape contract for generated PPTD pages. It deliberately
 * uses the dsh-tools author schema subset without importing the DSH runtime.
 */
export declare const WRITE_PAGE_PARAMETER_SPEC: {
    readonly id: {
        readonly description?: string | undefined;
        readonly type: "string";
    } & {
        readonly required: true;
    };
    readonly pageType: {
        readonly description?: string | undefined;
        readonly type: "string";
    };
    readonly background: {
        readonly oneOf: [Schema, Schema, ...Schema[]];
    };
    readonly notes: {
        readonly description?: string | undefined;
        readonly type: "string";
    };
    readonly elements: {
        readonly description?: string | undefined;
        readonly type: "array";
        readonly items: Schema;
    } & {
        readonly required: true;
    };
    readonly animations: {
        readonly description?: string | undefined;
        readonly type: "array";
        readonly items: Schema;
    };
    readonly expectedPageSha256: {
        readonly description?: string | undefined;
        readonly type: "string";
    };
};
/** Element-scoped edit contract. The array contains only the authorized target
 * elements, but every item is a complete canonical native PPTD element. */
export declare const EDIT_ELEMENTS_PARAMETER_SPEC: {
    readonly pageId: {
        readonly description?: string | undefined;
        readonly type: "string";
    } & {
        readonly required: true;
    };
    readonly expectedPageSha256: {
        readonly description?: string | undefined;
        readonly type: "string";
    } & {
        readonly required: true;
    };
    readonly elements: {
        readonly description?: string | undefined;
        readonly type: "array";
        readonly items: Schema;
    } & {
        readonly required: true;
    };
};
/** Compile the shared specification to standard JSON Schema. DSH's author DSL
 * drops array cardinality keywords, so publish this lossless form to providers. */
export declare function writePageJsonSchema(): Record<string, unknown>;
export declare function editElementsJsonSchema(): Record<string, unknown>;
export type CanonicalWritePageArgs = {
    id: string;
    pageType?: string;
    background?: Fill;
    notes?: string;
    elements: PptdElement[];
    animations?: Animation[];
    expectedPageSha256?: string;
};
export type CanonicalEditElementsArgs = {
    pageId: string;
    expectedPageSha256: string;
    elements: PptdElement[];
};
/** Validate structure and the tuple/non-empty rules outside DSH's JSON Schema subset. */
export declare function canonicalWritePageIssues(value: unknown): string[];
/** Validate the closed scoped-edit root and every complete native element. */
export declare function canonicalEditElementsIssues(value: unknown): string[];
export declare function isCanonicalEditElementsArgs(value: unknown): value is CanonicalEditElementsArgs;
export declare function isCanonicalWritePageArgs(value: unknown): value is CanonicalWritePageArgs;
/** Validate a single Fill value (solid/gradient/image) against the write schema. */
export declare function canonicalFillIssues(value: unknown): string[];
/**
 * Validate a text-style patch field by field: only textContent properties are
 * accepted and each must match its declared type. Unlike the full text
 * content object, no key is required — a patch only carries what it changes.
 */
export declare function canonicalTextStylePatchIssues(patch: unknown): string[];
/** Models often send the string "null" instead of JSON null for a missing line head. */
export declare function coerceLineArrowHead(value: unknown): "arrow" | "stealth" | "diamond" | "oval" | null | unknown;
export declare function normalizeWritePageLineArrows(args: Record<string, unknown>): void;
/** MiniMax and similar adapters wrap strings as { $text: "Microsoft YaHei" }. */
export declare function normalizeWritePageDialect(args: Record<string, unknown>): void;
export {};
//# sourceMappingURL=write-page-schema.d.ts.map