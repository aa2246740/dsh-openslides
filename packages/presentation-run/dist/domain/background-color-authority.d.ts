export type BackgroundColorWriteAuthority = {
    readonly backgroundColorOverride?: true;
    readonly persistedBackgroundColor?: string;
};
export type BackgroundColorWriteAuthorityInput = {
    readonly projectRoot?: string;
    readonly pageId: string;
    readonly persistedBackgroundColor?: unknown;
    readonly includeActiveOverride?: boolean;
    readonly now?: number;
};
/**
 * Build the only pack-color exceptions a page write may receive.
 *
 * The active exception is project-local, expires with the editor lock, and is
 * limited to the lock's exact page set. A persisted solid background is a
 * baseline only: layout QA still compares the incoming canonical
 * `background.color` against it and does not extend the exception to elements.
 */
export declare function backgroundColorWriteAuthority({ projectRoot, pageId, persistedBackgroundColor, includeActiveOverride, now, }: BackgroundColorWriteAuthorityInput): BackgroundColorWriteAuthority;
//# sourceMappingURL=background-color-authority.d.ts.map