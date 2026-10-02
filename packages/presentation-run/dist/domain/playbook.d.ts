export declare const DEFAULT_DESIGN_SYSTEM = "consulting/pine-green-strategy";
export declare const DEFAULT_CATEGORY = "analysis-decision";
export type DesignSystemRef = {
    id: string;
    file: string;
};
export type Palette = {
    background: string;
    text: string;
    muted: string;
    primary: string;
    accent: string;
    danger: string;
};
export type PlaybookBundle = {
    skillRoot: string;
    designSystemId: string;
    categoryId: string;
    designMarkdown: string;
    categoryMarkdown: string;
    categoryGuideExcerpt: string;
    skillExcerpt: string;
    pptdExcerpt: string;
    recipesMarkdown: string;
    palette: Palette;
};
export declare function resolveSkillRoot(start?: string): string;
export declare function listDesignSystems(skillRoot: string): DesignSystemRef[];
export declare function resolveDesignSystemFile(skillRoot: string, id: string): string;
/** Pull a usable 6-color palette from a design.md hex soup. */
export declare function extractPalette(markdown: string): Palette;
/** Catalog-only playbook. Host did not pick a named system or category. */
export declare function catalogOnlyPlaybook(skillRoot?: string): PlaybookBundle;
export declare function loadPlaybook(opts?: {
    skillRoot?: string;
    designSystemId?: string;
    categoryId?: string;
    /** When false, missing ids do not fall back to pine-green / analysis-decision. */
    hostDefaults?: boolean;
}): PlaybookBundle;
//# sourceMappingURL=playbook.d.ts.map