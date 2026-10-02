export function pageRasterModelContent(opts) {
    const text = { type: "text", text: JSON.stringify(opts.json) };
    if (opts.visionMode === "main-model" && opts.pngBytes && opts.pngBytes.length >= 64) {
        return [
            text,
            {
                type: "image",
                mediaType: "image/png",
                data: opts.pngBytes.toString("base64"),
                name: "page-raster.png",
            },
        ];
    }
    return [text];
}
export function renderPageToolContent(value) {
    const rec = value && typeof value === "object" ? value : {};
    const rest = { ...rec };
    const image = rest.image;
    const extraImages = Array.isArray(rest.images) ? rest.images : [];
    delete rest.image;
    delete rest.images;
    const blocks = [
        { type: "text", text: JSON.stringify(rest) },
    ];
    const pushAttachment = (img) => {
        if (typeof img.attachmentId === "string" && img.attachmentId.length > 0) {
            blocks.push({
                type: "image",
                attachment: {
                    attachmentId: img.attachmentId,
                    mediaType: typeof img.mediaType === "string" ? img.mediaType : "image/png",
                    bytes: typeof img.bytes === "number" ? img.bytes : undefined,
                    width: typeof img.width === "number" ? img.width : undefined,
                    height: typeof img.height === "number" ? img.height : undefined,
                    name: typeof img.name === "string" ? img.name : undefined,
                },
            });
        }
    };
    if (image && typeof image === "object")
        pushAttachment(image);
    for (const img of extraImages) {
        if (img && typeof img === "object")
            pushAttachment(img);
    }
    return blocks;
}
export function shouldAttachPageRaster(opts) {
    return opts.visionMode === "main-model" && Boolean(opts.pngBytes && opts.pngBytes.length >= 64);
}
//# sourceMappingURL=page-raster-content.js.map