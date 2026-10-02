export declare function mediaId(raw: string, fallback?: string): string;
export declare function saveMediaFile(projectRoot: string, id: string, bytes: Buffer, ext?: string): {
    src: string;
    abs: string;
};
export declare function mediaExists(projectRoot: string, src: string): boolean;
export declare function listMedia(projectRoot: string): string[];
//# sourceMappingURL=media-store.d.ts.map