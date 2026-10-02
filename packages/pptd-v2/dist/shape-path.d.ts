import { type ShapeGeometry } from "./ooxml-geom.js";
/** OOXML adj units: 0–100000 → 0–1. */
export declare function adjUnit(v: number | undefined, fallback: number): number;
/**
 * SVG path in viewBox 0 0 100 100.
 * Prefers the ECMA-376 interpreter; falls back to the hand path table.
 */
export declare function shapePath(shapeName: string, adjustments?: number[]): string;
export declare function shapeGeometry(shapeName: string, adjustments?: number[]): ShapeGeometry;
export declare function shapeSvg(shapeName: string, opts?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    adjustments?: number[];
}): string;
//# sourceMappingURL=shape-path.d.ts.map