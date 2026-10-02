export type AdjustHandle = {
    kind: "xy" | "polar";
    /** Position in viewBox 0–100. */
    x: number;
    y: number;
    adjIndexX?: number;
    adjIndexY?: number;
    adjIndexAng?: number;
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
    minAng?: number;
    maxAng?: number;
};
export type ShapeGeometry = {
    fill: string;
    stroke: string;
    handles: AdjustHandle[];
};
export declare function ooxmlPresetNames(): string[];
export declare function ooxmlShapeGeometry(name: string, adjustments?: number[]): ShapeGeometry | null;
export declare function ooxmlAdjustHandles(name: string, adjustments?: number[]): AdjustHandle[];
export declare function ooxmlShapePath(name: string, adjustments?: number[]): string | null;
//# sourceMappingURL=ooxml-geom.d.ts.map