import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
export const OPENKIMI_VISUAL_MANIFEST_VERSION = "openkimi-visual-manifest-v1";
const VISUAL_ROOT_REL = path.join("vendor", "open-kimi-ppt", "git-pre-wipe", "docs", "themes");
const MANIFEST_REL = path.join("packages", "agent-harness", "reference", "openkimi-visual-manifest.v1.json");
export class OpenKimiVisualPackError extends Error {
    name = "OpenKimiVisualPackError";
}
export function openKimiVisualSourceId(designSystemId) {
    return `openkimi-preview:${assertDesignSystemId(designSystemId)}`;
}
export function resolveOpenKimiVisualRoot(repoRoot) {
    return path.resolve(repoRoot, VISUAL_ROOT_REL);
}
export function resolveOpenKimiVisualManifestPath(repoRoot) {
    return path.resolve(repoRoot, MANIFEST_REL);
}
export function createOpenKimiVisualManifest(sourceRoot) {
    const absoluteRoot = path.resolve(sourceRoot);
    const files = listRegularJpegs(absoluteRoot).map((relativePath) => {
        const designSystemId = relativePath.replace(/\.jpg$/i, "");
        const bytes = readVisualFile(absoluteRoot, relativePath);
        return {
            sourceId: openKimiVisualSourceId(designSystemId),
            designSystemId,
            relativePath,
            byteLength: bytes.length,
            sha256: sha256(bytes),
            mediaType: "image/jpeg",
        };
    });
    return { version: OPENKIMI_VISUAL_MANIFEST_VERSION, files };
}
export function verifyOpenKimiVisualPack(repoRoot, options = {}) {
    const sourceRoot = path.resolve(options.sourceRoot ?? resolveOpenKimiVisualRoot(repoRoot));
    const manifestPath = path.resolve(options.manifestPath ?? resolveOpenKimiVisualManifestPath(repoRoot));
    const manifest = loadOpenKimiVisualManifest(manifestPath);
    const entriesById = new Map();
    const entriesByDesignSystemId = new Map();
    for (const entry of manifest.files) {
        verifyEntryShape(entry);
        if (entriesById.has(entry.sourceId)) {
            throw new OpenKimiVisualPackError(`duplicate visual source id: ${entry.sourceId}`);
        }
        if (entriesByDesignSystemId.has(entry.designSystemId)) {
            throw new OpenKimiVisualPackError(`duplicate visual design system: ${entry.designSystemId}`);
        }
        entriesById.set(entry.sourceId, entry);
        entriesByDesignSystemId.set(entry.designSystemId, entry);
    }
    const expected = manifest.files.map((entry) => entry.relativePath).sort();
    const actual = listRegularJpegs(sourceRoot);
    assertSamePaths(expected, actual, sourceRoot);
    for (const entry of manifest.files)
        verifyEntryBytes(sourceRoot, entry);
    return {
        sourceRoot,
        manifestPath,
        manifest,
        entriesById,
        entriesByDesignSystemId,
    };
}
export function resolveOpenKimiDesignPreview(pack, designSystemId) {
    const normalized = assertDesignSystemId(designSystemId);
    const entry = pack.entriesByDesignSystemId.get(normalized);
    if (!entry) {
        throw new OpenKimiVisualPackError(`OpenKimi preview not found: ${normalized}`);
    }
    return entry;
}
export function readOpenKimiVisualBytes(pack, sourceId) {
    assertCurrentPaths(pack);
    const entry = pack.entriesById.get(sourceId);
    if (!entry)
        throw new OpenKimiVisualPackError(`unknown visual source id: ${sourceId}`);
    return verifyEntryBytes(pack.sourceRoot, entry);
}
export function loadOpenKimiVisualManifest(manifestPath) {
    let value;
    try {
        value = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new OpenKimiVisualPackError(`cannot read visual manifest ${manifestPath}: ${detail}`);
    }
    if (!isRecord(value) || value.version !== OPENKIMI_VISUAL_MANIFEST_VERSION) {
        throw new OpenKimiVisualPackError("invalid OpenKimi visual manifest version");
    }
    if (!Array.isArray(value.files) || value.files.length === 0) {
        throw new OpenKimiVisualPackError("OpenKimi visual manifest has no files");
    }
    return {
        version: OPENKIMI_VISUAL_MANIFEST_VERSION,
        files: value.files.map(parseEntry),
    };
}
function parseEntry(value) {
    if (!isRecord(value))
        throw new OpenKimiVisualPackError("invalid visual manifest entry");
    if (typeof value.sourceId !== "string" ||
        typeof value.designSystemId !== "string" ||
        typeof value.relativePath !== "string" ||
        typeof value.byteLength !== "number" ||
        typeof value.sha256 !== "string" ||
        value.mediaType !== "image/jpeg") {
        throw new OpenKimiVisualPackError("invalid visual manifest entry fields");
    }
    return {
        sourceId: value.sourceId,
        designSystemId: value.designSystemId,
        relativePath: value.relativePath,
        byteLength: value.byteLength,
        sha256: value.sha256,
        mediaType: "image/jpeg",
    };
}
function verifyEntryShape(entry) {
    const relativePath = assertSafeVisualPath(entry.relativePath);
    const designSystemId = relativePath.replace(/\.jpg$/i, "");
    if (entry.designSystemId !== designSystemId) {
        throw new OpenKimiVisualPackError(`visual design id mismatch: ${relativePath}`);
    }
    if (entry.sourceId !== openKimiVisualSourceId(designSystemId)) {
        throw new OpenKimiVisualPackError(`visual source id mismatch: ${relativePath}`);
    }
    if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 64) {
        throw new OpenKimiVisualPackError(`invalid visual byte length: ${relativePath}`);
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) {
        throw new OpenKimiVisualPackError(`invalid visual sha256: ${relativePath}`);
    }
    if (entry.mediaType !== "image/jpeg") {
        throw new OpenKimiVisualPackError(`unsupported visual media type: ${relativePath}`);
    }
}
function verifyEntryBytes(sourceRoot, entry) {
    const bytes = readVisualFile(sourceRoot, entry.relativePath);
    if (bytes.length !== entry.byteLength) {
        throw new OpenKimiVisualPackError(`visual byte length mismatch: ${entry.relativePath}`);
    }
    if (sha256(bytes) !== entry.sha256) {
        throw new OpenKimiVisualPackError(`visual file hash mismatch: ${entry.relativePath}`);
    }
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
        throw new OpenKimiVisualPackError(`visual file is not a complete JPEG: ${entry.relativePath}`);
    }
    return bytes;
}
function assertCurrentPaths(pack) {
    assertSamePaths(pack.manifest.files.map((entry) => entry.relativePath).sort(), listRegularJpegs(pack.sourceRoot), pack.sourceRoot);
}
function listRegularJpegs(sourceRoot) {
    const absoluteRoot = path.resolve(sourceRoot);
    const stat = safeLstat(absoluteRoot, "visual source root");
    if (!stat.isDirectory()) {
        throw new OpenKimiVisualPackError(`visual source root is not a directory: ${absoluteRoot}`);
    }
    const found = [];
    const walk = (directory, relativeDirectory) => {
        for (const child of fs
            .readdirSync(directory, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name))) {
            const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
            const absolutePath = resolveVisualEntry(absoluteRoot, relativePath);
            const childStat = safeLstat(absolutePath, relativePath);
            if (childStat.isSymbolicLink()) {
                throw new OpenKimiVisualPackError(`symbolic links are forbidden: ${relativePath}`);
            }
            if (childStat.isDirectory()) {
                walk(absolutePath, relativePath);
            }
            else if (childStat.isFile() && /\.jpg$/i.test(child.name)) {
                found.push(assertSafeVisualPath(relativePath));
            }
            else {
                throw new OpenKimiVisualPackError(`unexpected visual pack entry: ${relativePath}`);
            }
        }
    };
    walk(absoluteRoot, "");
    return found.sort();
}
function readVisualFile(sourceRoot, relativePath) {
    const absolutePath = resolveVisualFile(sourceRoot, relativePath);
    const stat = safeLstat(absolutePath, relativePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new OpenKimiVisualPackError(`visual entry is not a regular file: ${relativePath}`);
    }
    return fs.readFileSync(absolutePath);
}
function resolveVisualFile(sourceRoot, relativePath) {
    const safe = assertSafeVisualPath(relativePath);
    return resolveVisualEntry(sourceRoot, safe);
}
function resolveVisualEntry(sourceRoot, relativePath) {
    const safe = assertSafeVisualEntryPath(relativePath);
    const root = path.resolve(sourceRoot);
    const candidate = path.resolve(root, ...safe.split("/"));
    if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) {
        throw new OpenKimiVisualPackError(`visual path escapes root: ${relativePath}`);
    }
    return candidate;
}
function assertSafeVisualPath(value) {
    const safe = assertSafeVisualEntryPath(value);
    if (!/^[a-z0-9-]+\/[a-z0-9-]+\.jpg$/.test(safe)) {
        throw new OpenKimiVisualPackError(`unexpected visual path shape: ${value}`);
    }
    return safe;
}
function assertSafeVisualEntryPath(value) {
    if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0")) {
        throw new OpenKimiVisualPackError(`invalid visual relative path: ${String(value)}`);
    }
    if (path.posix.isAbsolute(value)) {
        throw new OpenKimiVisualPackError(`absolute visual path is forbidden: ${value}`);
    }
    const parts = value.split("/");
    if (parts.some((part) => !part || part === "." || part === "..")) {
        throw new OpenKimiVisualPackError(`unsafe visual relative path: ${value}`);
    }
    if (!parts.every((part) => /^[a-z0-9.-]+$/.test(part))) {
        throw new OpenKimiVisualPackError(`unexpected visual entry name: ${value}`);
    }
    return value;
}
function assertDesignSystemId(value) {
    if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(value)) {
        throw new OpenKimiVisualPackError(`invalid design system id: ${value}`);
    }
    return value;
}
function assertSamePaths(expected, actual, root) {
    const missing = expected.filter((item) => !actual.includes(item));
    const added = actual.filter((item) => !expected.includes(item));
    if (missing.length || added.length) {
        const detail = [
            missing.length ? `missing ${missing.join(", ")}` : "",
            added.length ? `added ${added.join(", ")}` : "",
        ]
            .filter(Boolean)
            .join("; ");
        throw new OpenKimiVisualPackError(`visual pack file set mismatch at ${root}: ${detail}`);
    }
}
function safeLstat(filePath, label) {
    try {
        return fs.lstatSync(filePath);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new OpenKimiVisualPackError(`cannot stat ${label}: ${detail}`);
    }
}
function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=openkimi-visual-pack.js.map