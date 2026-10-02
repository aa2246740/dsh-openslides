export declare const EXPECTED_SOURCE_FILES = 73;
export declare const EXPECTED_VISUAL_FILES = 44;
export type CatalogSource = {
    readonly sourceId: string;
    readonly relativePath: string;
    readonly byteLength: number;
    readonly fileSha256: string;
    readonly family?: string;
    readonly kind: "source" | "visual";
    readonly designSystemId?: string;
    readonly chunks?: readonly {
        readonly chunkIndex: number;
    }[];
};
export type ReferenceCatalog = {
    readonly sourceFiles: number;
    readonly visualFiles: number;
    readonly sources: readonly CatalogSource[];
    readonly visuals: readonly CatalogSource[];
};
export declare function resolveRepoRoot(start?: string): string;
export declare function loadReferenceCatalog(repoRoot?: string): ReferenceCatalog;
export declare function filterCatalog(catalog: ReferenceCatalog, query?: {
    family?: string;
    kind?: "source" | "visual";
    tag?: string;
}): ReferenceCatalog;
export type CatalogFormat = {
    readonly kind: "Slides";
    readonly layout: "16:9" | "4:3";
};
export type CatalogPreview = {
    readonly sourceId: string;
    readonly hash: string;
    readonly url: string;
    readonly order: number;
};
export type CatalogStyle = {
    readonly id: string;
    readonly label: string;
    readonly category: string;
    readonly designSourceId: string;
    readonly designHash: string;
    readonly previews: readonly CatalogPreview[];
};
export type CatalogDto = {
    readonly version: 1;
    readonly hash: string;
    readonly formats: readonly CatalogFormat[];
    readonly styles: readonly CatalogStyle[];
};
export declare function buildCatalogDto(repoRoot?: string): CatalogDto;
export declare function resolveCatalogPreviewFile(sourceId: string, repoRoot?: string): {
    filePath: string;
    bytes: Buffer;
    mediaType: string;
    byteLength: number;
    sha256: string;
} | null;
//# sourceMappingURL=catalog.d.ts.map