import type PptxGenJS from "pptxgenjs";
/** Use the same offline Font Awesome faces as the editor, as editable outlines. */
export declare function iconOutline(name: string, width: number, height: number): Promise<({
    x: PptxGenJS.Coord;
    y: PptxGenJS.Coord;
    moveTo?: boolean;
} | {
    x: PptxGenJS.Coord;
    y: PptxGenJS.Coord;
    curve: {
        type: "arc";
        hR: PptxGenJS.Coord;
        wR: PptxGenJS.Coord;
        stAng: number;
        swAng: number;
    };
} | {
    x: PptxGenJS.Coord;
    y: PptxGenJS.Coord;
    curve: {
        type: "cubic";
        x1: PptxGenJS.Coord;
        y1: PptxGenJS.Coord;
        x2: PptxGenJS.Coord;
        y2: PptxGenJS.Coord;
    };
} | {
    x: PptxGenJS.Coord;
    y: PptxGenJS.Coord;
    curve: {
        type: "quadratic";
        x1: PptxGenJS.Coord;
        y1: PptxGenJS.Coord;
    };
} | {
    close: true;
})[]>;
//# sourceMappingURL=icon-outline.d.ts.map