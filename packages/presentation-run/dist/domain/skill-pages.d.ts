import type { Bounds, Fill, Page, PptdElement, PptdProject } from "@open-slidestudio/pptd-v2";
import type { ComposeDeck } from "./compose-ir.js";
import type { Palette } from "./playbook.js";
export type SkillPageInput = {
    id: string;
    pageType?: string;
    notes?: string;
    background?: Fill;
    animations?: Page["animations"];
    elements: PptdElement[];
};
export type SkillDeckInput = {
    title: string;
    pages: SkillPageInput[];
};
export declare function parseBounds(raw: unknown): Bounds | null;
/** OpenKimi PPTD is `data.cols` + `data.rows`. Models often send `{ chart: { rows, encode } }` without cols. */
export declare function normalizeChartInput(rec: Record<string, unknown>): Record<string, unknown>;
export declare function inferSkillPageType(rec: Record<string, unknown>): string;
/** Official playbook vocab: header / list / box / circle / band / group + position. */
export declare function expandPlaybookElements(raw: unknown[], pageType?: string): unknown[];
export declare function parseElement(raw: unknown, index: number): PptdElement | null;
/**
 * The agent sometimes dumps every slide into one canvas `elements[]`.
 * Split on slide-N / page-N ids, else on 540px vertical stacks.
 */
export declare function pagesFromFlatElements(rec: Record<string, unknown>): unknown[];
/** True when the payload already looks like skill PPTD (pages with elements). */
export declare function hasSkillElements(raw: unknown): boolean;
export declare function parseSkillPage(raw: unknown, index?: number): SkillPageInput | null;
export declare function countRawChartElements(elements: unknown): number;
export declare const DROPPED_CHART_DETAIL = "chart element was sent but not persisted. OpenKimi PPTD charts need data.cols + data.rows. Nested chart.rows + encode is accepted. A chart-typed element with no rows is not a figure. Host will not silently drop charts.";
export declare function parseSkillDeck(raw: unknown): SkillDeckInput | null;
export declare function assertSkillDeck(deck: SkillDeckInput, opts?: {
    minPages?: number;
}): void;
/** Plan/timeline view of a skill deck. Disk SSOT is still the PPTD pages. */
export declare function skillToCompose(deck: SkillDeckInput): ComposeDeck;
export declare function applySkillDeck(project: PptdProject, deck: SkillDeckInput, pal?: Palette): void;
//# sourceMappingURL=skill-pages.d.ts.map