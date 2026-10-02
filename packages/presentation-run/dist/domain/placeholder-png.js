/**
 * Offline labeled stand-in image. Not a photograph.
 * Used when the image API is off or fails, so layout still has a file + ratio.
 */
import zlib from "node:zlib";
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) {
            c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
    }
    return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crc]);
}
/** 16:9 by default so cover / place photos can keep aspect. */
export function placeholderSize(aspect) {
    const raw = (aspect || "16:9").trim();
    if (raw === "1:1" || raw === "square")
        return { width: 1024, height: 1024 };
    if (raw === "4:3")
        return { width: 1024, height: 768 };
    if (raw === "3:4" || raw === "portrait")
        return { width: 768, height: 1024 };
    return { width: 1280, height: 720 };
}
/** Three-band PNG so it is obviously a 占位, not a stock photo. */
export function writePlaceholderPng(aspect) {
    const { width, height } = placeholderSize(aspect);
    const stride = width * 3 + 1;
    const raw = Buffer.alloc(stride * height);
    const sky = [196, 214, 224];
    const mid = [232, 220, 196];
    const ground = [120, 132, 128];
    const barH = Math.max(8, Math.round(height * 0.08));
    for (let y = 0; y < height; y++) {
        const row = y * stride;
        raw[row] = 0;
        const band = y < height * 0.42 ? sky : y < height * 0.72 ? mid : ground;
        const mark = y < barH || y >= height - barH;
        for (let x = 0; x < width; x++) {
            const i = row + 1 + x * 3;
            const edge = x < 10 || x >= width - 10;
            const c = mark || edge ? [90, 86, 78] : band;
            raw[i] = c[0];
            raw[i + 1] = c[1];
            raw[i + 2] = c[2];
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return {
        width,
        height,
        bytes: Buffer.concat([
            sig,
            chunk("IHDR", ihdr),
            chunk("IDAT", zlib.deflateSync(raw)),
            chunk("IEND", Buffer.alloc(0)),
        ]),
    };
}
//# sourceMappingURL=placeholder-png.js.map