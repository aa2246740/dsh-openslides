import { type PptdProject } from "@open-slidestudio/pptd-v2";
export type PngExportResult = {
    data: Buffer;
    filename: string;
    width: number;
    height: number;
    pageIndex: number;
    /** Solid fill only — not a visual of the page. Use harness render_page for #slide. */
    kind: "background-only";
};
/**
 * Offline PNG of slide size + background color only.
 * This is not a picture of the page. Visual QA must use native #slide.
 */
export declare function exportPageToPng(source: string | PptdProject, pageIndex?: number): PngExportResult;
//# sourceMappingURL=export-png.d.ts.map