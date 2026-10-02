/**
 * Pluggable image search. No vendor hardcode.
 * POST { query } → { images: [{ url | b64_json, width, height, attribution }] }.
 */
export type ImageSearchHit = {
    bytes: Buffer;
    mime: "image/png" | "image/jpeg" | "image/webp";
    width?: number;
    height?: number;
    attribution?: string;
    note: string;
};
export type ImageSearchNone = {
    kind: "none";
    note: string;
};
export type ImageSearchPortConfig = {
    url?: string;
    apiKey?: string;
    timeoutMs?: number;
};
export type ImageSearchPort = {
    search: (query: string) => Promise<ImageSearchHit | ImageSearchNone>;
};
export type ImageSearchPortDeps = {
    fetch?: typeof fetch;
};
export declare function imageSearchConfigFromEnv(env?: NodeJS.ProcessEnv): ImageSearchPortConfig;
export declare function imageSearchConfigured(cfg?: ImageSearchPortConfig): boolean;
export declare function createImageSearchPort(cfg?: ImageSearchPortConfig, deps?: ImageSearchPortDeps): ImageSearchPort;
//# sourceMappingURL=image-search-port.d.ts.map