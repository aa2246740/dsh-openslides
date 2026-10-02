/**
 * Shared, observable text semantics for native canvas, PPTX export, and
 * rendered layout checks. PPTD bounds are content boxes, not padded text-box
 * boxes.
 */
import type { LayoutRole, PptdElement } from "./types.js";
export declare const DEFAULT_TEXT_LINE_HEIGHT = 1.2;
export type TextLayoutContractV1 = Readonly<{
    version: "pptd-text-layout-v1";
    paragraphBreaks: "preserve";
    whiteSpace: "pre-wrap";
    contentInsetPx: 0;
    defaultLineHeight: typeof DEFAULT_TEXT_LINE_HEIGHT;
    /** Default footer reserve top for the canonical 960 × 540 PPTD canvas. */
    footerZoneTop: number;
}>;
export declare const TEXT_LAYOUT_CONTRACT_V1: TextLayoutContractV1;
/** Scale the canonical footer reserve for any PPTD slide height. */
export declare function footerZoneTopForSlide(slideHeight: number): number;
/**
 * Preserve the explicit role first. For older OpenKimi PPTD, recognize only
 * clearly named text nodes that start inside the canonical footer reserve.
 * This keeps legacy page numbers and source notes without excusing body copy
 * that merely spills into the footer zone.
 */
export declare function effectiveLayoutRole(element: Pick<PptdElement, "elementId" | "elementType" | "bounds" | "layoutRole">): LayoutRole | undefined;
//# sourceMappingURL=text-layout.d.ts.map