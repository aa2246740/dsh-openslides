/**
 * Skill produce: images live in project media/, then YAML src points at them.
 */
import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./atomic-file.js";
const SAFE_ID = /[^a-zA-Z0-9_-]+/g;
export function mediaId(raw, fallback = "img") {
    const id = raw.trim().replace(SAFE_ID, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    return id || fallback;
}
export function saveMediaFile(projectRoot, id, bytes, ext = "png") {
    const base = mediaId(id);
    const suffix = ext.replace(/^\./, "");
    const dir = path.join(projectRoot, "media");
    fs.mkdirSync(dir, { recursive: true });
    // Sanitized ids collide (e.g. "a b" and "a-b"): never clobber different
    // bytes under the same name — suffix until free. Identical bytes reuse.
    let name = `${base}.${suffix}`;
    let abs = path.join(dir, name);
    for (let n = 2; fs.existsSync(abs); n++) {
        if (n > 999)
            throw new Error(`media id namespace exhausted for ${base}`);
        try {
            if (fs.readFileSync(abs).equals(bytes))
                break;
        }
        catch {
            break;
        }
        name = `${base}-${n}.${suffix}`;
        abs = path.join(dir, name);
    }
    writeFileAtomic(abs, bytes);
    return { src: `media/${name}`, abs };
}
export function mediaExists(projectRoot, src) {
    const rel = src.replace(/^\/+/, "");
    if (!rel.startsWith("media/"))
        return false;
    const abs = path.resolve(projectRoot, rel);
    const root = path.resolve(projectRoot);
    if (!abs.startsWith(root + path.sep))
        return false;
    return fs.existsSync(abs);
}
export function listMedia(projectRoot) {
    const dir = path.join(projectRoot, "media");
    if (!fs.existsSync(dir))
        return [];
    return fs
        .readdirSync(dir)
        .filter((name) => !name.startsWith("."))
        .map((name) => `media/${name}`)
        .sort();
}
//# sourceMappingURL=media-store.js.map