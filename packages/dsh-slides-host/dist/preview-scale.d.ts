/**
 * Long edge for the sample page sent to the produce model.
 * Session 83a2b098 attached nine 1920×1080 tiles from extra/xuan-paper-annual
 * and grok-4.6 answered with 493 identical write_page skeletons in one step.
 * One 720px tile is enough for the taste gate to count the preview as seen.
 */
export declare const PREVIEW_MAX_DIMENSION = 720;
/** OpenKimi Hub previews are tall strips. Never attach the whole strip. */
export declare const MAX_DESIGN_PREVIEW_ATTACHMENTS = 1;
export declare function designPreviewTileCount(size: {
    readonly width: number;
    readonly height: number;
}): number;
export declare function designPreviewAttachmentPlan(size: {
    readonly width: number;
    readonly height: number;
}): {
    readonly stripTiles: number;
    readonly attachCount: number;
    readonly longEdge: number;
};
/** Read pixel dimensions from a JPEG SOF marker, or undefined if unknown. */
export declare function jpegDimensions(bytes: Buffer): {
    width: number;
    height: number;
} | undefined;
/** Long edge cap for a single tile when the store refuses full resolution. */
export declare function scaleJpegToFit(bytes: Buffer, maxDimension?: number): Promise<Buffer>;
/**
 * Split a preview strip into page tiles. Caps how many tiles are produced so
 * a 8–9 page OpenKimi strip cannot flood the next LLM request.
 */
export declare function splitPreviewForAttachment(bytes: Buffer, maxTiles?: number): Promise<Buffer[]>;
//# sourceMappingURL=preview-scale.d.ts.map