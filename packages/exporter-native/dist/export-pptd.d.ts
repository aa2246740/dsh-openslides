import { type PptdProject } from "@open-slidestudio/pptd-v2";
import { type EmbeddedFontInfo, type FontEmbedOptions, type SkippedFont } from "./font-embed.js";
export type Degradation = {
    slideIndex: number;
    elementId?: string;
    kind: string;
    reason: string;
};
export declare const HARD_DEGRADATION_KINDS: readonly ["missing-image", "error", "chart-export-failed", "line-geometry", "full-page-raster"];
export type ExportReportValidation = {
    ok: true;
    report: ExportReport;
} | {
    ok: false;
    reason: string;
    hardDegradation?: Degradation;
};
export declare function validateExportReport(raw: unknown, options?: {
    minSlideCount?: number;
}): ExportReportValidation;
export type ExportReport = {
    ok: boolean;
    slideCount: number;
    nativeCoverage: number;
    degradations: Degradation[];
    editDataCharts: {
        ok: string[];
        failed: string[];
    };
    editableLines: EditableLineEvidence[];
    bytes: number;
    embeddedFonts?: EmbeddedFontInfo[];
    skippedFonts?: SkippedFont[];
};
export type ExportPptxOptions = {
    embedFonts?: FontEmbedOptions;
};
export type EditableLineEvidence = {
    slideIndex: number;
    elementId: string;
    source: {
        bounds: [number, number, number, number];
        viewBox: [number, number];
        points: string;
        rotation?: number;
        opacity?: number;
        flipH?: boolean;
        flipV?: boolean;
    };
    output: {
        kind: "custom-geometry" | "axis-fallback";
        objectName: string;
        segmentCount: number;
    };
    preserved: boolean;
};
export type ExportResult = {
    data: Buffer;
    report: ExportReport;
    filename: string;
};
/** Minimal natural-size probe — enough to convert crop fractions into OOXML
 * srcRect values that compose with cover fitting. */
export declare function probeImageSize(buf: Buffer): {
    w: number;
    h: number;
} | undefined;
export declare function exportProjectToPptx(source: string | PptdProject, opts?: ExportPptxOptions): Promise<ExportResult>;
export declare function exportProjectToFile(source: string | PptdProject, outPath: string, opts?: ExportPptxOptions): Promise<ExportResult>;
//# sourceMappingURL=export-pptd.d.ts.map