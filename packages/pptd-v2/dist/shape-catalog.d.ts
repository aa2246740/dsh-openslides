/** Official PPTD shape catalog from open-kimi shapes.md (177 names). */
export type ShapeInfo = {
    name: string;
    title: string;
    group: string;
    adjLabel: string;
    defaults: number[];
};
export declare const SHAPE_CATALOG: ShapeInfo[];
export declare const SHAPE_BY_NAME: Map<string, ShapeInfo>;
/** Accepted model-facing aliases. Values are names from the official catalog. */
export declare const SHAPE_ALIASES: Readonly<Record<string, string>>;
/** Canonical and explicitly supported alias names accepted by new page writes. */
export declare const SUPPORTED_SHAPE_NAMES: readonly string[];
export declare function canonicalShapeName(name: string): string;
export declare function isSupportedShapeName(name: string): boolean;
export declare function shapeDefaults(name: string): number[];
//# sourceMappingURL=shape-catalog.d.ts.map