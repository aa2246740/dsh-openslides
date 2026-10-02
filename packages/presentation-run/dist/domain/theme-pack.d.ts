import { type BriefKind } from "./compose-ir.js";
export declare const KIND_THEME_PACK_ERROR = "kind_theme_pack";
export declare const MISSING_THEME_PACK_ERROR = "missing_theme_pack";
export declare const PACK_COLOR_ERROR = "pack_color";
export type ChosenThemePack = {
    readonly id: string;
    readonly family: string;
};
export type KindThemePackIssue = {
    readonly code: typeof KIND_THEME_PACK_ERROR | typeof MISSING_THEME_PACK_ERROR;
    readonly kind: BriefKind;
    readonly packId?: string;
    readonly family?: string;
    readonly detail: string;
};
export type KindThemePackInput = {
    readonly brief: string;
    readonly designSystemId?: string;
    readonly adoptedSourceIds?: readonly string[];
    /** User named a pack (explicit-style). That pack is allowed; extra agent adopts are not. */
    readonly userExplicitPack?: boolean;
};
/**
 * Parse a catalog source id, preview id, or group/slug into a canonical pack id.
 * SKILL.md, categories, and agent-self-directed-plan are not packs.
 */
export declare function parseThemePackId(raw: string): string | undefined;
export declare function themePackFamily(packId: string): string;
export declare function sourceIdList(...raw: unknown[]): string[];
export declare function chosenThemePacksFrom(input: {
    designSystemId?: string;
    adoptedSourceIds?: readonly string[];
}): ChosenThemePack[];
/** Families that satisfy director kind. Undefined = empty adopt is allowed. */
export declare function requiredPackFamilies(kind: BriefKind): readonly string[] | undefined;
export declare function kindThemePackDisagreement(kind: BriefKind, packs: readonly ChosenThemePack[]): KindThemePackIssue | undefined;
export declare function kindThemePackIssue(input: KindThemePackInput): KindThemePackIssue | undefined;
/**
 * Official design.md PART B 【Color Palette】 hexes. Unprefixed RRGGBB is not
 * a Color Palette token. Empty when the pack has no PART B palette section.
 */
export declare function extractColorPaletteHexes(markdown: string): string[];
export type PackColorWriteContext = {
    readonly adoptedPackId?: string;
    readonly adoptedPackHexes?: ReadonlySet<string>;
    readonly otherPackHexes?: ReadonlySet<string>;
};
export declare function catalogPackPaletteHexes(): ReadonlyMap<string, ReadonlySet<string>>;
export declare function packColorWriteContext(packIds: readonly string[]): PackColorWriteContext;
export declare function packColorWriteContextFrom(input: {
    designSystemId?: string;
    adoptedSourceIds?: readonly string[];
}): PackColorWriteContext;
//# sourceMappingURL=theme-pack.d.ts.map