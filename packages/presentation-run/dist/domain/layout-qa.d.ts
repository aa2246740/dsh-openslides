/**
 * Native structural QA — skill step 4 without export_images.py / Kimi iframe.
 * Media is optional: missing_media only fires if the agent chose a src.
 * compose mode: empty pages + unlabeled invented numbers + dangling src.
 * strict mode: also wants a non-image-or-image exhibit and rejects three plates.
 */
import type { PptdElement } from "@open-slidestudio/pptd-v2";
import { type Theme } from "@open-slidestudio/pptd-v2";
import { type TodoExhibitKind } from "./page-plan.js";
export { TODO_EXHIBIT_KINDS, isTodoExhibitKind, type TodoExhibitKind } from "./page-plan.js";
export { persistPageKey, persistPagePathFromId } from "./page-identity.js";
import type { SkillPageInput } from "./skill-pages.js";
export type LayoutIssue = {
    pageId: string;
    code: "empty" | "no_exhibit" | "unlabeled_stat" | "missing_media" | "three_plates" | "doc_wall" | "no_color" | "empty_box" | "homemade" | "unnamed_gap" | "missing_column" | "missing_locked_fact" | "unsupported_chart" | "invalid_chart_data" | "implicit_chart_palette" | "missing_requested_exhibit" | "weak_title" | "tiny_text" | "text_wall" | "overstuffed" | "chart_pileup" | "chart_too_small" | "edge_cling" | "broken_gauge" | "empty_cell" | "overflow" | "overlap" | "zero_area" | "bounds_omitted" | "footer_zone" | "invalid_color" | "pack_color" | "reused_cover_src";
    message: string;
};
export type LayoutReview = {
    ok: boolean;
    visualQa: "skipped";
    issues: LayoutIssue[];
    pages: {
        id: string;
        coverage: number;
        exhibit: string | null;
        imageSrcs: string[];
    }[];
};
export declare const SLIDE_WIDTH = 960;
export declare const SLIDE_HEIGHT = 540;
export type TodoExhibitContract = {
    title: string;
    note?: string;
    exhibits?: TodoExhibitKind[];
};
/** Compatibility path for old outlines. New runs must write typed exhibits. */
export declare function inferTodoExhibits(text: string): TodoExhibitKind[];
export declare function inferBriefPageExhibits(brief: string, pageNumber: number): TodoExhibitKind[];
/**
 * Resolve the executable exhibit contract for one todo page.
 * Explicit declarations, legacy outline wording, and page-specific brief
 * requirements are additive. A real requirement always removes `none`.
 */
export declare function resolveTodoExhibits(todo: TodoExhibitContract, index: number, brief: string): TodoExhibitKind[];
export declare function requestedExhibitIssues(page: SkillPageInput, todo: TodoExhibitContract | undefined): LayoutIssue[];
export declare function pageCoverage(elements: PptdElement[]): number;
export declare function pageText(elements: PptdElement[]): string;
/** Compose/write refuse: send produce back. Do not host-fill leftover YAML. */
export declare const EMPTY_CLOSER_PRODUCE_NEXT = "closing page has no readable copy. write_page the last page as \u7ED3\u675F\u9875 with title, recap, and the meeting ask. Do not call compose_deck or review_pages until that write_page lands. Host will not paint leftover pages.";
/** Host-opened seed listed beside a real agent cover. Do not paint it. */
export declare const HOST_SEED_PRODUCE_NEXT = "host-opened seed 1_cover.page is still listed in the composed deck. persist-by-id kept the filename; compose will not seal a leftover seed as slide 1. write_page id 1_cover with real cover copy, or do not list the seed. Host will not paint leftover pages.";
export type DeckPageView = {
    readonly path: string;
    readonly page: {
        readonly pageType?: string;
        readonly elements: readonly PptdElement[];
    };
};
export type ComposedPageLeftoverIssue = {
    readonly pageId: string;
    readonly path: string;
    readonly kind: "host_seed" | "leftover_content" | "empty_closer";
    readonly message: string;
};
/** Exact `createEmptyProject` basename. `01_cover` / `p01_cover` are agent ids. */
export declare function isHostOpenedSeedPath(name: string): boolean;
/**
 * Leftover host seed: white title-only `pages/1_cover.page` still in a multi-page
 * deck. Agent overwrite in place (readable copy on that file) is not leftover.
 */
export declare function isHostOpenedSeedPage(loaded: DeckPageView, deckPageCount: number): boolean;
/**
 * Scan the whole composed page list. Last-page-only leftover-closer missed the
 * host seed sitting as slide 1 in front of a real agent cover.
 */
export declare function composedPageLeftoverIssues(pages: readonly DeckPageView[]): ComposedPageLeftoverIssue[];
/**
 * Recorded rendered hard fail always blocks compose. Strict local-editor runs
 * additionally require a current deterministic pass even when vision is none.
 */
export declare function renderedLayoutBlocksCompose(layout: "pass" | "fail" | "unavailable" | "missing", requireCurrentPass?: boolean): boolean;
/** Cover/TOC are not closers. Last page, pageType final/close, or id closing. */
export declare function isCloserPage(page: {
    id?: string;
    pageType?: string;
}, index?: number, last?: number): boolean;
/**
 * A real 结束页 needs title + recap (at least two visible text runs).
 * A navy field with arcs is not readable copy.
 */
export declare function pageHasReadableCopy(page: {
    elements: readonly PptdElement[];
}): boolean;
/**
 * Visible content is text, table body values, or chart series.
 * Shape-area coverage is not content. A full-bleed navy rect is empty.
 */
export declare function pageHasVisibleContent(page: {
    elements: readonly PptdElement[];
}): boolean;
export declare function pageIdMatchesFile(pageId: string, filePath: string): boolean;
export declare function isLeftoverContentBasename(name: string): boolean;
export declare function isPlaceholderReviewIssue(issue: string): boolean;
/** Reject omitted / invented / zero-area bounds on the agent payload, before parse fills them. */
export declare function rawPageBoundsIssues(rawPage: Record<string, unknown>, pageId: string): LayoutIssue[];
/** Label promised a figure; host will not leave a hollow slot. */
export declare function chartSlotWithoutExhibitIssues(page: SkillPageInput): LayoutIssue[];
export declare function tableEmptyCellIssues(page: SkillPageInput): LayoutIssue[];
export declare function pageGeometryIssues(page: SkillPageInput): LayoutIssue[];
export type WritePageSchemaContext = {
    writtenIndex?: number;
    writtenLast?: number;
    lastDiskBasename?: string;
    diskPageCount?: number;
    theme?: Theme;
    adoptedPackId?: string;
    adoptedPackHexes?: ReadonlySet<string> | readonly string[];
    otherPackHexes?: ReadonlySet<string> | readonly string[];
    backgroundColorOverride?: boolean;
    persistedBackgroundColor?: string;
    siblingImageSrcs?: readonly {
        pageId: string;
        src: string;
    }[];
    photoExhibit?: boolean;
    projectRoot?: string;
};
export declare const REUSED_COVER_SRC_DETAIL = "full-bleed image src is already used on another page; each photo-led page needs its own media id";
export declare function reusedFullBleedSrcIssue(page: SkillPageInput, siblingImageSrcs: readonly {
    pageId: string;
    src: string;
}[]): LayoutIssue | undefined;
/** A photo todo promises a photo-led page; media must exist before write_page. */
export declare function photoExhibitIssues(page: SkillPageInput, ctx: WritePageSchemaContext): LayoutIssue[];
export declare function isWritePageCloser(page: SkillPageInput, ctx?: WritePageSchemaContext): boolean;
export declare function writePageColorIssues(page: SkillPageInput, theme?: Theme, pack?: Pick<WritePageSchemaContext, "adoptedPackId" | "adoptedPackHexes" | "otherPackHexes" | "backgroundColorOverride" | "persistedBackgroundColor">): LayoutIssue[];
/**
 * Deterministic YAML/schema refuse for write_page. Empty navy, empty table
 * cells, and invented bounds are not vision problems.
 */
export declare function writePageSchemaIssues(page: SkillPageInput, ctx?: WritePageSchemaContext, rawPage?: Record<string, unknown>): LayoutIssue[];
export declare function writePageSchemaError(issues: readonly LayoutIssue[], page: SkillPageInput, ctx?: WritePageSchemaContext): {
    error: string;
    detail: string;
    pageId: string;
} | undefined;
/** Every classroom page, including cover and takeaway, needs a drawing — not cards+copy. */
export declare function isCoursewareExhibitPage(_page: SkillPageInput, _index: number, _last?: number): boolean;
/**
 * Agent-drawn paper-white layouts (no host recipe ids).
 * Cover: giant blush circle + band. Route: coral rule + vertical spine + stations.
 * Concept: coral rule + two columns. Method: three condition panels.
 * Demo: top band + result bar. Transfer: action panel.
 */
export declare function hasPaperWhiteStructure(elements: PptdElement[]): boolean;
/** Official recipe or a real exhibit — not two colored cards plus homework copy. */
export declare function hasDrawnExhibit(elements: PptdElement[]): boolean;
export declare function detectExhibit(elements: PptdElement[]): string | null;
/** Three equal-width plates — the stamp the skill forbids as a default. */
export declare function hasThreePlates(elements: PptdElement[]): boolean;
export declare function isNeutralHex(hex: string): boolean;
export declare function collectPageHexes(page: SkillPageInput): string[];
export declare function hasCoursewareColor(page: SkillPageInput): boolean;
export declare function coursewarePageIssues(page: SkillPageInput, opts: {
    body: boolean;
}): LayoutIssue[];
export declare function hasUnlabeledStat(text: string, researchHadGap: boolean): boolean;
export declare function reviewSkillPages(pages: SkillPageInput[], opts?: {
    projectRoot?: string;
    researchHadGap?: boolean;
    todos?: readonly TodoExhibitContract[];
    /** compose = empty/fake/dangling src only. strict = also require an exhibit. */
    mode?: "compose" | "strict";
    /** K-12 courseware: reject cream+black text walls. */
    courseware?: boolean;
}): LayoutReview;
//# sourceMappingURL=layout-qa.d.ts.map