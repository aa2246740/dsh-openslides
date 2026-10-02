export declare const OPENKIMI_VISUAL_MANIFEST_VERSION = "openkimi-visual-manifest-v1";
export type OpenKimiVisualManifestEntry = Readonly<{
    sourceId: string;
    designSystemId: string;
    relativePath: string;
    byteLength: number;
    sha256: string;
    mediaType: "image/jpeg";
}>;
export type OpenKimiVisualManifest = Readonly<{
    version: typeof OPENKIMI_VISUAL_MANIFEST_VERSION;
    files: readonly OpenKimiVisualManifestEntry[];
}>;
export type VerifiedOpenKimiVisualPack = Readonly<{
    sourceRoot: string;
    manifestPath: string;
    manifest: OpenKimiVisualManifest;
    entriesById: ReadonlyMap<string, OpenKimiVisualManifestEntry>;
    entriesByDesignSystemId: ReadonlyMap<string, OpenKimiVisualManifestEntry>;
}>;
export type VerifyOpenKimiVisualPackOptions = Readonly<{
    sourceRoot?: string;
    manifestPath?: string;
}>;
export declare class OpenKimiVisualPackError extends Error {
    readonly name = "OpenKimiVisualPackError";
}
export declare function openKimiVisualSourceId(designSystemId: string): string;
export declare function resolveOpenKimiVisualRoot(repoRoot: string): string;
export declare function resolveOpenKimiVisualManifestPath(repoRoot: string): string;
export declare function createOpenKimiVisualManifest(sourceRoot: string): OpenKimiVisualManifest;
export declare function verifyOpenKimiVisualPack(repoRoot: string, options?: VerifyOpenKimiVisualPackOptions): VerifiedOpenKimiVisualPack;
export declare function resolveOpenKimiDesignPreview(pack: VerifiedOpenKimiVisualPack, designSystemId: string): OpenKimiVisualManifestEntry;
export declare function readOpenKimiVisualBytes(pack: VerifiedOpenKimiVisualPack, sourceId: string): Buffer;
export declare function loadOpenKimiVisualManifest(manifestPath: string): OpenKimiVisualManifest;
//# sourceMappingURL=openkimi-visual-pack.d.ts.map