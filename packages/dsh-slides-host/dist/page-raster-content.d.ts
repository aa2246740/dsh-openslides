/**
 * Model-facing render_page / review_page content.
 * grok-4.6 is multimodal: a page raster must ride an image part, not JSON-only.
 */
export type PageRasterTextBlock = {
    readonly type: "text";
    readonly text: string;
};
export type PageRasterImageDataBlock = {
    readonly type: "image";
    readonly mediaType: "image/png";
    readonly data: string;
    readonly name?: string;
};
export type PageRasterAttachmentBlock = {
    readonly type: "image";
    readonly attachment: {
        readonly attachmentId: string;
        readonly mediaType: string;
        readonly bytes?: number;
        readonly width?: number;
        readonly height?: number;
        readonly name?: string;
    };
};
export type PageRasterModelBlock = PageRasterTextBlock | PageRasterImageDataBlock;
export declare function pageRasterModelContent(opts: {
    readonly json: unknown;
    readonly pngBytes?: Buffer;
    readonly visionMode: "none" | "main-model" | "reviewer";
}): PageRasterModelBlock[];
export declare function renderPageToolContent(value: unknown): Array<PageRasterTextBlock | PageRasterAttachmentBlock>;
export declare function shouldAttachPageRaster(opts: {
    readonly visionMode: string;
    readonly pngBytes?: Buffer;
}): boolean;
//# sourceMappingURL=page-raster-content.d.ts.map