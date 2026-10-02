import { type PptdProject } from "@open-slidestudio/pptd-v2";
/** One vendored face of a family: a font file plus its css font-weight. */
export type FontFaceSource = {
    weight: number;
    file: string;
};
export type EmbeddedFontFace = {
    typeface: string;
    /** OOXML slot weight: ≤500 → p:regular child, >500 → p:bold child. */
    weight: number;
    ttf: Buffer;
    glyphs: number;
};
export type EmbeddedFontInfo = {
    typeface: string;
    weight: number;
    bytes: number;
    glyphs: number;
};
export type SkippedFont = {
    typeface: string;
    reason: string;
};
export type FontEmbedPlan = {
    fonts: EmbeddedFontFace[];
    skipped: SkippedFont[];
};
export type FontEmbedOptions = {
    fontsDir: string;
    families: Map<string, FontFaceSource[]>;
};
/**
 * Collect the deck's font families and a charset covering every renderable
 * string. The charset is a union over all text, so each embedded face gets a
 * conservative superset of the glyphs it can be asked to draw.
 */
export declare function collectUsedText(project: PptdProject): {
    families: Set<string>;
    charset: Set<number>;
};
/** OS/2 fsType bit 0x0002 = Restricted License: embedding is not permitted. */
export declare function fsTypeRestricted(fsType: number | undefined): boolean;
/** Read fsType straight from the sfnt directory, before any subset work. */
export declare function sfntFsType(sfnt: Uint8Array): number | undefined;
/**
 * Subset every used family that ships in fonts.css into real TTF payloads.
 * A family yields up to two faces: the regular slot (weight closest to 400
 * among ≤500, else the first entry) and the bold slot (closest to 700 among
 * >500, when a distinct face exists). Per-font failures never abort the
 * export — the family lands in `skipped`.
 */
export declare function buildEmbeddedFonts(project: PptdProject, families: Map<string, FontFaceSource[]>, fontsDir: string): Promise<FontEmbedPlan>;
/**
 * Inject fntdata parts, rels, and p:embeddedFontLst into a pptx zip.
 * embeddedFontLst must sit before p:defaultTextStyle in p:presentation.
 */
export declare function embedFontsIntoPptx(buffer: Buffer, plan: FontEmbedPlan): Promise<{
    data: Buffer;
    embedded: EmbeddedFontInfo[];
}>;
//# sourceMappingURL=font-embed.d.ts.map