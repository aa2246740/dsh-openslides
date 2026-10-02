import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
/**
 * Write a file via a sibling temp + rename so a concurrent reader never sees
 * a truncated JSON payload. Same-directory rename is atomic on POSIX/NTFS.
 */
export function writeFileAtomic(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
        fs.writeFileSync(tmp, content);
        fs.renameSync(tmp, file);
    }
    catch (error) {
        try {
            fs.unlinkSync(tmp);
        }
        catch {
            // temp may not exist if the write itself failed
        }
        throw error;
    }
}
export function writeJsonAtomic(file, value) {
    writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}
/**
 * Move a corrupt file aside so it stops poisoning every read. Returns the
 * quarantine path, or undefined when the file could not be moved. Callers
 * must still fail closed for authoritative files (runtime.json, bindings):
 * quarantining them would silently drop strict-execution flags.
 */
export function quarantineCorruptFile(file) {
    try {
        const dest = `${file}.corrupt-${Date.now()}`;
        fs.renameSync(file, dest);
        return dest;
    }
    catch {
        return undefined;
    }
}
/**
 * Portable bounded spin for lock retry loops. Atomics.wait on a
 * SharedArrayBuffer is unavailable in some embedders (renderer processes,
 * restricted workers); a few ms of busy-wait is acceptable inside a retry.
 */
export function spinWait(ms) {
    const end = Date.now() + Math.max(0, ms);
    while (Date.now() < end) {
        // intentional bounded spin
    }
}
//# sourceMappingURL=atomic-file.js.map