export type ImageRebuildConfig = {
    baseUrl: string;
    apiKey?: string;
    model: string;
    timeoutMs?: number;
    /** false = text-only backend; throws so callers fall back. */
    image?: boolean;
};
export type RebuildNode = {
    text: string;
    role?: "title" | "node" | "caption";
};
export declare function imageToDataUrl(file: string): string;
/**
 * Read an image into structured nodes. Throws when the backend cannot
 * read images or returns no nodes — the caller falls back.
 */
export declare function rebuildNodesFromImage(config: ImageRebuildConfig, imagePath: string, hint?: string): Promise<RebuildNode[]>;
//# sourceMappingURL=image-rebuild.d.ts.map