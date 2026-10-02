import { type CanonicalEditElementsArgs, type CanonicalWritePageArgs } from "@open-slidestudio/pptd-v2";
type ActiveElementEditScope = Readonly<{
    pagePath: string;
    pageId: string;
    elementIds: readonly string[];
    expiresAt: number;
}>;
export type PreparedElementEdit = {
    readonly ok: true;
    readonly page: CanonicalWritePageArgs;
} | {
    readonly ok: false;
    readonly outcome: {
        readonly outcome: "rejected";
        readonly error: string;
        readonly detail: string;
        readonly painted: false;
    };
};
/** Resolve the exact per-page union from the editor's durable guard. */
export declare function activeElementEditScope(projectRoot: string, pageId?: string): ActiveElementEditScope | undefined;
/** Resolve one authoritative page and merge only the exact authorized element
 * set. The returned object is a complete write_page input; page metadata,
 * non-target elements, and array positions all come from disk. */
export declare function prepareElementEdit(projectRoot: string, args: CanonicalEditElementsArgs): PreparedElementEdit;
export {};
//# sourceMappingURL=edit-elements.d.ts.map