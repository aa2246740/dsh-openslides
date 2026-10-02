/**
 * Write a file via a sibling temp + rename so a concurrent reader never sees
 * a truncated JSON payload. Same-directory rename is atomic on POSIX/NTFS.
 */
export declare function writeFileAtomic(file: string, content: string | Buffer): void;
export declare function writeJsonAtomic(file: string, value: unknown): void;
/**
 * Move a corrupt file aside so it stops poisoning every read. Returns the
 * quarantine path, or undefined when the file could not be moved. Callers
 * must still fail closed for authoritative files (runtime.json, bindings):
 * quarantining them would silently drop strict-execution flags.
 */
export declare function quarantineCorruptFile(file: string): string | undefined;
/**
 * Portable bounded spin for lock retry loops. Atomics.wait on a
 * SharedArrayBuffer is unavailable in some embedders (renderer processes,
 * restricted workers); a few ms of busy-wait is acceptable inside a retry.
 */
export declare function spinWait(ms: number): void;
//# sourceMappingURL=atomic-file.d.ts.map