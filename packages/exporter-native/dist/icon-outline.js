import fs from "node:fs";
import { Font, woff2 } from "fonteditor-core";
const assets = new URL("../assets/fa/", import.meta.url);
const unicode = JSON.parse(fs.readFileSync(new URL("unicode.json", assets), "utf8"));
const fonts = new Map();
let ready;
/** Use the same offline Font Awesome faces as the editor, as editable outlines. */
export async function iconOutline(name, width, height) {
    const [prefix, key] = name.includes(":") ? name.split(":") : ["fas", name];
    const code = unicode[key];
    const face = prefix === "fas" ? "solid-900" : prefix === "far" ? "regular-400" : prefix === "fab" ? "brands-400" : undefined;
    if (!code || !face)
        throw new Error(`Unsupported icon: ${name}`);
    let pending = fonts.get(face);
    if (!pending) {
        pending = (async () => {
            await (ready ??= woff2.init());
            const bytes = fs.readFileSync(new URL(`fa-${face}.woff2`, assets));
            return Font.create(Buffer.from(woff2.decode(bytes)), { type: "ttf" }).get();
        })();
        fonts.set(face, pending);
    }
    const font = await pending;
    const glyph = font.glyf.find(g => g.unicode?.includes(parseInt(code, 16)));
    if (!glyph?.contours?.length)
        throw new Error(`Missing icon outline: ${name}`);
    const gw = glyph.xMax - glyph.xMin;
    const gh = glyph.yMax - glyph.yMin;
    const scale = Math.min(width / gw, height / gh);
    const x = (v) => (width - gw * scale) / 2 + (v - glyph.xMin) * scale;
    const y = (v) => (height - gh * scale) / 2 + (glyph.yMax - v) * scale;
    const points = [];
    for (const contour of glyph.contours) {
        if (!contour.length)
            continue;
        const first = contour[0];
        const last = contour[contour.length - 1];
        const start = first.onCurve ? first : last.onCurve ? last : { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
        points.push({ x: x(start.x), y: y(start.y), moveTo: true });
        for (let i = 0; i < contour.length; i++) {
            const current = contour[i];
            const next = contour[(i + 1) % contour.length];
            if (current.onCurve && next.onCurve)
                points.push({ x: x(next.x), y: y(next.y) });
            else if (!current.onCurve) {
                const end = next.onCurve ? next : { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
                points.push({ x: x(end.x), y: y(end.y), curve: { type: "quadratic", x1: x(current.x), y1: y(current.y) } });
            }
        }
        points.push({ close: true });
    }
    return points;
}
//# sourceMappingURL=icon-outline.js.map