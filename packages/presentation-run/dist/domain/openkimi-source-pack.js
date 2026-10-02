/**
 * Checked, byte-exact access to the pinned OpenKimi source pack.
 *
 * This module deliberately exposes source bytes and UTF-8 text without a
 * prompt-sized excerpt layer. The manifest is the integrity boundary; it is
 * generated from every regular file in the pinned vendor directory.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
export const OPENKIMI_SOURCE_MANIFEST_VERSION = "openkimi-source-manifest-v1";
export const OPENKIMI_SOURCE_CHUNK_BYTES = 12 * 1024;
const VENDOR_RELATIVE_ROOT = path.join("vendor", "open-kimi-ppt", "skill-1.2.0", "skills", "open-kimi-ppt");
const MANIFEST_RELATIVE_PATH = path.join("packages", "agent-harness", "reference", "openkimi-source-manifest.v1.json");
const BASELINE_SOURCE_PATHS = {
    skill: "SKILL.md",
    pptd: "reference/pptd.md",
    categories: "reference/slides_categories.md",
};
export class OpenKimiSourcePackError extends Error {
    name = "OpenKimiSourcePackError";
}
export function openKimiSourceId(relativePath) {
    return `openkimi:${assertSafeRelativePath(relativePath)}`;
}
export function resolveOpenKimiSourceRoot(repoRoot) {
    return path.resolve(repoRoot, VENDOR_RELATIVE_ROOT);
}
export function resolveOpenKimiSourceManifestPath(repoRoot) {
    return path.resolve(repoRoot, MANIFEST_RELATIVE_PATH);
}
/** Generate the checked manifest. Commit its JSON output, never the vendor files. */
export function createOpenKimiSourceManifest(sourceRoot) {
    const absoluteRoot = path.resolve(sourceRoot);
    const relativePaths = listRegularRelativePaths(absoluteRoot);
    const files = relativePaths.map((relativePath) => {
        const bytes = readRegularFile(absoluteRoot, relativePath);
        assertUtf8(bytes, relativePath);
        const chunks = chunkBytes(bytes, OPENKIMI_SOURCE_CHUNK_BYTES).map((chunk, index) => ({
            index,
            byteStart: chunk.byteStart,
            byteEndExclusive: chunk.byteEndExclusive,
            sha256: sha256(chunk.bytes),
        }));
        return {
            sourceId: openKimiSourceId(relativePath),
            relativePath,
            pathSha256: sha256(Buffer.from(relativePath, "utf8")),
            byteLength: bytes.length,
            sha256: sha256(bytes),
            chunks,
        };
    });
    return {
        version: OPENKIMI_SOURCE_MANIFEST_VERSION,
        chunkBytes: OPENKIMI_SOURCE_CHUNK_BYTES,
        files,
    };
}
/**
 * Verify a repository's checked source pack. This is intentionally strict:
 * the manifest and vendor tree must name exactly the same regular files.
 */
export function verifyOpenKimiPack(repoRoot) {
    return verifyOpenKimiPackAt(repoRoot);
}
export function verifyOpenKimiPackAt(repoRoot, options = {}) {
    const sourceRoot = path.resolve(options.sourceRoot ?? resolveOpenKimiSourceRoot(repoRoot));
    const manifestPath = path.resolve(options.manifestPath ?? resolveOpenKimiSourceManifestPath(repoRoot));
    const manifest = loadOpenKimiSourceManifest(manifestPath);
    verifyManifestShape(manifest);
    const entriesById = new Map();
    const entriesByPath = new Map();
    for (const entry of manifest.files) {
        if (entriesById.has(entry.sourceId)) {
            throw new OpenKimiSourcePackError(`duplicate source id: ${entry.sourceId}`);
        }
        if (entriesByPath.has(entry.relativePath)) {
            throw new OpenKimiSourcePackError(`duplicate source path: ${entry.relativePath}`);
        }
        entriesById.set(entry.sourceId, entry);
        entriesByPath.set(entry.relativePath, entry);
    }
    const actualPaths = listRegularRelativePaths(sourceRoot);
    const expectedPaths = [...entriesByPath.keys()].sort();
    assertSamePaths(expectedPaths, actualPaths, sourceRoot);
    for (const entry of manifest.files) {
        verifyEntryBytes(sourceRoot, entry);
    }
    return {
        sourceRoot,
        manifestPath,
        manifest,
        entriesById,
        entriesByPath,
    };
}
export function loadOpenKimiSourceManifest(manifestPath) {
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new OpenKimiSourcePackError(`cannot read source manifest ${manifestPath}: ${detail}`);
    }
    return parseManifest(parsed);
}
/** Return a full original UTF-8 chunk with its checked byte identity. */
export function readOpenKimiSourceChunk(pack, sourceId, index) {
    assertCurrentPackPaths(pack);
    const entry = pack.entriesById.get(sourceId);
    if (!entry)
        throw new OpenKimiSourcePackError(`unknown OpenKimi source id: ${sourceId}`);
    const chunk = entry.chunks[index];
    if (!chunk || chunk.index !== index) {
        throw new OpenKimiSourcePackError(`unknown chunk ${index} for ${sourceId}`);
    }
    const bytes = verifyEntryBytes(pack.sourceRoot, entry);
    const chunkBytes = bytes.subarray(chunk.byteStart, chunk.byteEndExclusive);
    if (sha256(chunkBytes) !== chunk.sha256) {
        throw new OpenKimiSourcePackError(`chunk hash mismatch: ${sourceId}#${index}`);
    }
    const text = decodeUtf8(chunkBytes, `${sourceId}#${index}`);
    return {
        sourceId,
        relativePath: entry.relativePath,
        index,
        byteStart: chunk.byteStart,
        byteEndExclusive: chunk.byteEndExclusive,
        sha256: chunk.sha256,
        fileSha256: entry.sha256,
        bytes: Buffer.from(chunkBytes),
        text,
    };
}
/** Reassemble the checked chunks into byte-identical original file bytes. */
export function readOpenKimiSourceBytes(pack, sourceId) {
    const entry = requireEntry(pack, sourceId);
    const parts = entry.chunks.map((chunk) => readOpenKimiSourceChunk(pack, sourceId, chunk.index).bytes);
    const bytes = Buffer.concat(parts);
    if (bytes.length !== entry.byteLength || sha256(bytes) !== entry.sha256) {
        throw new OpenKimiSourcePackError(`reassembly mismatch: ${sourceId}`);
    }
    return bytes;
}
/** Reassemble a full original source file. No cap, summary, or ellipsis is added. */
export function readOpenKimiSource(pack, sourceId) {
    return decodeUtf8(readOpenKimiSourceBytes(pack, sourceId), sourceId);
}
export function listOpenKimiSourceRequirements(pack, input) {
    const requirements = [
        requirementForPath(pack, "skill", BASELINE_SOURCE_PATHS.skill),
        requirementForPath(pack, "pptd", BASELINE_SOURCE_PATHS.pptd),
        requirementForPath(pack, "categories", BASELINE_SOURCE_PATHS.categories),
    ];
    if (input.categoryId) {
        const categoryId = assertCategoryId(input.categoryId);
        requirements.push(requirementForPath(pack, "scenario", `reference/slides_categories/${categoryId}.md`));
    }
    if (input.designDirection.kind === "preset") {
        const preset = requireEntry(pack, input.designDirection.sourceId);
        if (!isDesignPath(preset.relativePath)) {
            throw new OpenKimiSourcePackError(`preset source is not an OpenKimi design file: ${input.designDirection.sourceId}`);
        }
        requirements.push(requirementForEntry("preset-design", preset));
    }
    return requirements;
}
export function resolveOpenKimiScenarioSourceId(pack, categoryId) {
    return requirementForPath(pack, "scenario", `reference/slides_categories/${assertCategoryId(categoryId)}.md`).sourceId;
}
/**
 * Resolve an explicit design preset to its source id. This accepts the
 * canonical group/slug id used by the host or an existing source id.
 */
export function resolveOpenKimiPresetDesignSourceId(pack, preset) {
    if (pack.entriesById.has(preset)) {
        const entry = requireEntry(pack, preset);
        if (!isDesignPath(entry.relativePath)) {
            throw new OpenKimiSourcePackError(`preset is not a design source: ${preset}`);
        }
        return entry.sourceId;
    }
    const normalized = assertPresetId(preset);
    const expectedPath = `reference/design_system/${normalized}/design.md`;
    const exact = pack.entriesByPath.get(expectedPath);
    if (exact)
        return exact.sourceId;
    const matching = [...pack.entriesByPath.values()].filter((entry) => {
        return designSystemIdForSourcePath(entry.relativePath) === normalized;
    });
    if (matching.length === 1)
        return matching[0].sourceId;
    if (matching.length > 1) {
        throw new OpenKimiSourcePackError(`ambiguous OpenKimi preset: ${preset}`);
    }
    throw new OpenKimiSourcePackError(`OpenKimi preset not found: ${preset}`);
}
function requirementForPath(pack, kind, relativePath) {
    const normalized = assertSafeRelativePath(relativePath);
    const entry = pack.entriesByPath.get(normalized);
    if (!entry)
        throw new OpenKimiSourcePackError(`required OpenKimi source not found: ${normalized}`);
    return requirementForEntry(kind, entry);
}
function requirementForEntry(kind, entry) {
    return {
        kind,
        sourceId: entry.sourceId,
        relativePath: entry.relativePath,
        requiredChunkIndexes: entry.chunks.map((chunk) => chunk.index),
    };
}
function requireEntry(pack, sourceId) {
    const entry = pack.entriesById.get(sourceId);
    if (!entry)
        throw new OpenKimiSourcePackError(`unknown OpenKimi source id: ${sourceId}`);
    return entry;
}
function verifyManifestShape(manifest) {
    if (manifest.version !== OPENKIMI_SOURCE_MANIFEST_VERSION) {
        throw new OpenKimiSourcePackError(`unsupported source manifest version: ${manifest.version}`);
    }
    if (manifest.chunkBytes !== OPENKIMI_SOURCE_CHUNK_BYTES) {
        throw new OpenKimiSourcePackError(`unexpected source chunk size: ${manifest.chunkBytes}`);
    }
    if (manifest.files.length === 0)
        throw new OpenKimiSourcePackError("source manifest has no files");
    for (const entry of manifest.files)
        verifyManifestEntryShape(entry);
}
function verifyManifestEntryShape(entry) {
    const relativePath = assertSafeRelativePath(entry.relativePath);
    if (entry.sourceId !== openKimiSourceId(relativePath)) {
        throw new OpenKimiSourcePackError(`source id does not match path: ${entry.sourceId}`);
    }
    assertSha256(entry.pathSha256, `path ${relativePath}`);
    if (entry.pathSha256 !== sha256(Buffer.from(relativePath, "utf8"))) {
        throw new OpenKimiSourcePackError(`path hash mismatch: ${relativePath}`);
    }
    if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) {
        throw new OpenKimiSourcePackError(`invalid byte length: ${relativePath}`);
    }
    assertSha256(entry.sha256, `file ${relativePath}`);
    let nextByteStart = 0;
    for (const [index, chunk] of entry.chunks.entries()) {
        if (chunk.index !== index) {
            throw new OpenKimiSourcePackError(`non-sequential chunk index: ${relativePath}`);
        }
        if (!Number.isSafeInteger(chunk.byteStart) ||
            !Number.isSafeInteger(chunk.byteEndExclusive) ||
            chunk.byteStart !== nextByteStart ||
            chunk.byteEndExclusive <= chunk.byteStart) {
            throw new OpenKimiSourcePackError(`non-contiguous chunk range: ${relativePath}#${index}`);
        }
        assertSha256(chunk.sha256, `chunk ${relativePath}#${index}`);
        nextByteStart = chunk.byteEndExclusive;
    }
    if (entry.byteLength === 0 && entry.chunks.length !== 0) {
        throw new OpenKimiSourcePackError(`empty file must not have chunks: ${relativePath}`);
    }
    if (entry.byteLength > 0 && entry.chunks.length === 0) {
        throw new OpenKimiSourcePackError(`non-empty file has no chunks: ${relativePath}`);
    }
    if (nextByteStart !== entry.byteLength) {
        throw new OpenKimiSourcePackError(`chunk ranges do not cover file: ${relativePath}`);
    }
}
function verifyEntryBytes(sourceRoot, entry) {
    const bytes = readRegularFile(sourceRoot, entry.relativePath);
    if (bytes.length !== entry.byteLength) {
        throw new OpenKimiSourcePackError(`byte length mismatch: ${entry.relativePath}`);
    }
    if (sha256(bytes) !== entry.sha256) {
        throw new OpenKimiSourcePackError(`file hash mismatch: ${entry.relativePath}`);
    }
    assertUtf8(bytes, entry.relativePath);
    for (const chunk of entry.chunks) {
        const rawChunk = bytes.subarray(chunk.byteStart, chunk.byteEndExclusive);
        if (sha256(rawChunk) !== chunk.sha256) {
            throw new OpenKimiSourcePackError(`chunk hash mismatch: ${entry.relativePath}#${chunk.index}`);
        }
        assertUtf8(rawChunk, `${entry.relativePath}#${chunk.index}`);
    }
    return bytes;
}
function assertCurrentPackPaths(pack) {
    const actualPaths = listRegularRelativePaths(pack.sourceRoot);
    assertSamePaths([...pack.entriesByPath.keys()].sort(), actualPaths, pack.sourceRoot);
}
function assertSamePaths(expected, actual, sourceRoot) {
    const missing = expected.filter((candidate) => !actual.includes(candidate));
    const added = actual.filter((candidate) => !expected.includes(candidate));
    if (missing.length > 0 || added.length > 0) {
        const chunks = [];
        if (missing.length > 0)
            chunks.push(`missing ${missing.join(", ")}`);
        if (added.length > 0)
            chunks.push(`added ${added.join(", ")}`);
        throw new OpenKimiSourcePackError(`source pack file set mismatch at ${sourceRoot}: ${chunks.join("; ")}`);
    }
}
function listRegularRelativePaths(sourceRoot) {
    const absoluteRoot = path.resolve(sourceRoot);
    const rootStat = lstat(absoluteRoot, "source root");
    if (!rootStat.isDirectory())
        throw new OpenKimiSourcePackError(`source root is not a directory: ${absoluteRoot}`);
    const found = [];
    const walk = (directory, relativeDirectory) => {
        for (const child of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
            const absolutePath = resolveSourceFile(absoluteRoot, relativePath);
            const stat = lstat(absolutePath, relativePath);
            if (stat.isSymbolicLink()) {
                throw new OpenKimiSourcePackError(`symbolic links are forbidden in source pack: ${relativePath}`);
            }
            if (stat.isDirectory()) {
                walk(absolutePath, relativePath);
            }
            else if (stat.isFile()) {
                found.push(assertSafeRelativePath(relativePath));
            }
            else {
                throw new OpenKimiSourcePackError(`non-regular source pack entry: ${relativePath}`);
            }
        }
    };
    walk(absoluteRoot, "");
    return found.sort();
}
function readRegularFile(sourceRoot, relativePath) {
    const safePath = assertSafeRelativePath(relativePath);
    const absolutePath = resolveSourceFile(sourceRoot, safePath);
    const stat = lstat(absolutePath, safePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new OpenKimiSourcePackError(`source entry is not a regular file: ${safePath}`);
    }
    return fs.readFileSync(absolutePath);
}
function resolveSourceFile(sourceRoot, relativePath) {
    const safePath = assertSafeRelativePath(relativePath);
    const absoluteRoot = path.resolve(sourceRoot);
    const candidate = path.resolve(absoluteRoot, ...safePath.split("/"));
    if (candidate === absoluteRoot || !candidate.startsWith(`${absoluteRoot}${path.sep}`)) {
        throw new OpenKimiSourcePackError(`source path escapes root: ${relativePath}`);
    }
    return candidate;
}
function assertSafeRelativePath(value) {
    if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.includes("\0")) {
        throw new OpenKimiSourcePackError(`invalid source relative path: ${String(value)}`);
    }
    if (path.posix.isAbsolute(value)) {
        throw new OpenKimiSourcePackError(`absolute source path is forbidden: ${value}`);
    }
    const parts = value.split("/");
    if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
        throw new OpenKimiSourcePackError(`unsafe source relative path: ${value}`);
    }
    return value;
}
function assertCategoryId(value) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
        throw new OpenKimiSourcePackError(`invalid scenario category: ${value}`);
    }
    return value;
}
function assertPresetId(value) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
        throw new OpenKimiSourcePackError(`invalid OpenKimi preset id: ${value}`);
    }
    return value;
}
function designSystemIdForSourcePath(relativePath) {
    if (!relativePath.startsWith("reference/design_system/"))
        return undefined;
    if (relativePath.endsWith("/design.md")) {
        const segments = relativePath.split("/");
        return `${segments.at(-3)}/${segments.at(-2)}`;
    }
    // The pinned theme index explicitly places its numbered English guides in
    // the extra preview namespace. Require this exact path shape and slug.
    const extra = /^reference\/design_system\/\d{2}_[^/]+\/\d{2}\/en\/([^/]+)\.md$/.exec(relativePath);
    return extra ? `extra/${extra[1]}` : undefined;
}
function isDesignPath(relativePath) {
    return designSystemIdForSourcePath(relativePath) !== undefined;
}
function chunkBytes(bytes, chunkSize) {
    if (bytes.length === 0)
        return [];
    const chunks = [];
    let byteStart = 0;
    while (byteStart < bytes.length) {
        let byteEndExclusive = Math.min(byteStart + chunkSize, bytes.length);
        if (byteEndExclusive < bytes.length) {
            while (byteEndExclusive > byteStart && isUtf8ContinuationByte(bytes[byteEndExclusive])) {
                byteEndExclusive -= 1;
            }
            if (byteEndExclusive === byteStart) {
                throw new OpenKimiSourcePackError("cannot split source into valid UTF-8 chunks");
            }
        }
        const chunk = bytes.subarray(byteStart, byteEndExclusive);
        assertUtf8(chunk, `chunk at ${byteStart}`);
        chunks.push({ byteStart, byteEndExclusive, bytes: Buffer.from(chunk) });
        byteStart = byteEndExclusive;
    }
    return chunks;
}
function isUtf8ContinuationByte(value) {
    return (value & 0b1100_0000) === 0b1000_0000;
}
function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
function decodeUtf8(bytes, label) {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new OpenKimiSourcePackError(`source is not valid UTF-8 (${label}): ${detail}`);
    }
}
function assertUtf8(bytes, label) {
    void decodeUtf8(bytes, label);
}
function assertSha256(value, label) {
    if (!/^[a-f0-9]{64}$/.test(value)) {
        throw new OpenKimiSourcePackError(`invalid sha256 for ${label}`);
    }
}
function lstat(filePath, label) {
    try {
        return fs.lstatSync(filePath);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new OpenKimiSourcePackError(`cannot stat ${label}: ${detail}`);
    }
}
function parseManifest(value) {
    if (!isRecord(value))
        throw new OpenKimiSourcePackError("source manifest is not an object");
    if (value.version !== OPENKIMI_SOURCE_MANIFEST_VERSION) {
        throw new OpenKimiSourcePackError("source manifest has an unsupported version");
    }
    if (!isSafeInteger(value.chunkBytes)) {
        throw new OpenKimiSourcePackError("source manifest has an invalid chunkBytes value");
    }
    if (!Array.isArray(value.files))
        throw new OpenKimiSourcePackError("source manifest files is not an array");
    return {
        version: OPENKIMI_SOURCE_MANIFEST_VERSION,
        chunkBytes: value.chunkBytes,
        files: value.files.map((entry) => parseManifestEntry(entry)),
    };
}
function parseManifestEntry(value) {
    if (!isRecord(value))
        throw new OpenKimiSourcePackError("source manifest entry is not an object");
    if (typeof value.sourceId !== "string" ||
        typeof value.relativePath !== "string" ||
        typeof value.pathSha256 !== "string" ||
        !isSafeInteger(value.byteLength) ||
        typeof value.sha256 !== "string" ||
        !Array.isArray(value.chunks)) {
        throw new OpenKimiSourcePackError("source manifest entry has invalid fields");
    }
    return {
        sourceId: value.sourceId,
        relativePath: value.relativePath,
        pathSha256: value.pathSha256,
        byteLength: value.byteLength,
        sha256: value.sha256,
        chunks: value.chunks.map((chunk) => parseChunkManifestEntry(chunk)),
    };
}
function parseChunkManifestEntry(value) {
    if (!isRecord(value))
        throw new OpenKimiSourcePackError("source manifest chunk is not an object");
    if (!isSafeInteger(value.index) ||
        !isSafeInteger(value.byteStart) ||
        !isSafeInteger(value.byteEndExclusive) ||
        typeof value.sha256 !== "string") {
        throw new OpenKimiSourcePackError("source manifest chunk has invalid fields");
    }
    return {
        index: value.index,
        byteStart: value.byteStart,
        byteEndExclusive: value.byteEndExclusive,
        sha256: value.sha256,
    };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSafeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value);
}
//# sourceMappingURL=openkimi-source-pack.js.map