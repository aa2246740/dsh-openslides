export declare const OPENKIMI_SOURCE_MANIFEST_VERSION = "openkimi-source-manifest-v1";
export declare const OPENKIMI_SOURCE_CHUNK_BYTES: number;
export type SourceChunkManifestEntry = Readonly<{
    index: number;
    byteStart: number;
    byteEndExclusive: number;
    sha256: string;
}>;
export type SourceManifestEntry = Readonly<{
    sourceId: string;
    relativePath: string;
    pathSha256: string;
    byteLength: number;
    sha256: string;
    chunks: readonly SourceChunkManifestEntry[];
}>;
export type OpenKimiSourceManifest = Readonly<{
    version: typeof OPENKIMI_SOURCE_MANIFEST_VERSION;
    chunkBytes: number;
    files: readonly SourceManifestEntry[];
}>;
export type VerifiedOpenKimiPack = Readonly<{
    sourceRoot: string;
    manifestPath: string;
    manifest: OpenKimiSourceManifest;
    entriesById: ReadonlyMap<string, SourceManifestEntry>;
    entriesByPath: ReadonlyMap<string, SourceManifestEntry>;
}>;
export type OpenKimiSourceChunk = Readonly<{
    sourceId: string;
    relativePath: string;
    index: number;
    byteStart: number;
    byteEndExclusive: number;
    sha256: string;
    fileSha256: string;
    bytes: Buffer;
    text: string;
}>;
export type DesignDirection = Readonly<{
    kind: "self-directed";
}> | Readonly<{
    kind: "user-design";
}> | Readonly<{
    kind: "preset";
    sourceId: string;
}>;
export type SourceRequirementKind = "skill" | "pptd" | "categories" | "scenario" | "preset-design";
export type SourceRequirement = Readonly<{
    kind: SourceRequirementKind;
    sourceId: string;
    relativePath: string;
    requiredChunkIndexes: readonly number[];
}>;
export type ResolveSourceRequirementsInput = Readonly<{
    categoryId?: string;
    designDirection: DesignDirection;
}>;
export type VerifyOpenKimiPackOptions = Readonly<{
    sourceRoot?: string;
    manifestPath?: string;
}>;
export declare class OpenKimiSourcePackError extends Error {
    readonly name = "OpenKimiSourcePackError";
}
export declare function openKimiSourceId(relativePath: string): string;
export declare function resolveOpenKimiSourceRoot(repoRoot: string): string;
export declare function resolveOpenKimiSourceManifestPath(repoRoot: string): string;
/** Generate the checked manifest. Commit its JSON output, never the vendor files. */
export declare function createOpenKimiSourceManifest(sourceRoot: string): OpenKimiSourceManifest;
/**
 * Verify a repository's checked source pack. This is intentionally strict:
 * the manifest and vendor tree must name exactly the same regular files.
 */
export declare function verifyOpenKimiPack(repoRoot: string): VerifiedOpenKimiPack;
export declare function verifyOpenKimiPackAt(repoRoot: string, options?: VerifyOpenKimiPackOptions): VerifiedOpenKimiPack;
export declare function loadOpenKimiSourceManifest(manifestPath: string): OpenKimiSourceManifest;
/** Return a full original UTF-8 chunk with its checked byte identity. */
export declare function readOpenKimiSourceChunk(pack: VerifiedOpenKimiPack, sourceId: string, index: number): OpenKimiSourceChunk;
/** Reassemble the checked chunks into byte-identical original file bytes. */
export declare function readOpenKimiSourceBytes(pack: VerifiedOpenKimiPack, sourceId: string): Buffer;
/** Reassemble a full original source file. No cap, summary, or ellipsis is added. */
export declare function readOpenKimiSource(pack: VerifiedOpenKimiPack, sourceId: string): string;
export declare function listOpenKimiSourceRequirements(pack: VerifiedOpenKimiPack, input: ResolveSourceRequirementsInput): readonly SourceRequirement[];
export declare function resolveOpenKimiScenarioSourceId(pack: VerifiedOpenKimiPack, categoryId: string): string;
/**
 * Resolve an explicit design preset to its source id. This accepts the
 * canonical group/slug id used by the host or an existing source id.
 */
export declare function resolveOpenKimiPresetDesignSourceId(pack: VerifiedOpenKimiPack, preset: string): string;
//# sourceMappingURL=openkimi-source-pack.d.ts.map