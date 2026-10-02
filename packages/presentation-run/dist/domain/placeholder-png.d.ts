export type PlaceholderSize = {
    width: number;
    height: number;
};
/** 16:9 by default so cover / place photos can keep aspect. */
export declare function placeholderSize(aspect?: string): PlaceholderSize;
/** Three-band PNG so it is obviously a 占位, not a stock photo. */
export declare function writePlaceholderPng(aspect?: string): {
    bytes: Buffer;
} & PlaceholderSize;
//# sourceMappingURL=placeholder-png.d.ts.map