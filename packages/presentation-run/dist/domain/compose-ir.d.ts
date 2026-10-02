/** Structured deck IR the playbook brain (LLM or deterministic) must emit. */
export type ComposeRole = "cover" | "toc" | "content" | "evidence" | "timeline" | "matrix" | "close";
export type ComposeChart = {
    title: string;
    cols: string[];
    rows: (string | number | null)[][];
    note?: string;
};
export type ComposePage = {
    kicker?: string;
    role: ComposeRole;
    title: string;
    subtitle?: string;
    chapter?: string;
    bullets?: string[];
    items?: string[];
    soWhat?: string;
    chart?: ComposeChart;
    note?: string;
};
export type ComposeDeck = {
    title: string;
    pages: ComposePage[];
};
/** Models often put body copy in points/body/content instead of bullets. */
export declare function collectPageLines(p: Record<string, unknown>, max?: number): string[] | undefined;
export declare function parseComposeDeck(raw: unknown): ComposeDeck;
export type ComposeTodo = {
    title: string;
    note?: string;
};
/** If compose omitted or underfilled bodies, reuse write_todo notes. */
export declare function fillComposeFromTodos(deck: ComposeDeck, todos: ComposeTodo[]): ComposeDeck;
export declare function assertComposeHasBody(deck: ComposeDeck, opts?: {
    minPages?: number;
    minBullets?: number;
}): void;
/** Accept ordinary Chinese answers such as 两页, without reading 第2页 as a total. */
export declare function requestedPageCountFromBrief(brief: string): number | undefined;
/** Classroom lessons need a full path only when the user omitted a count. */
export declare function composeBodyRules(brief: string, categoryId?: string, requestedPageCount?: number): {
    minPages: number;
    minBullets: number;
};
/** Parse + fill from todos + reject title-only pages. Agent compose must go through here. */
export declare function finalizeComposeDeck(raw: unknown, todos?: ComposeTodo[], opts?: {
    minPages?: number;
    minBullets?: number;
}): ComposeDeck;
/** Split a user brief into title + claim bullets without inventing facts. */
export declare function briefToOutline(brief: string): {
    title: string;
    claims: string[];
};
/** Pull source names + verbatim lines from `## 参考: <name>` blocks. Never invent numbers. */
export declare function extractReferenceLines(referenceText?: string): {
    names: string[];
    lines: string[];
};
/** Offline outline family. Not official research — just which recipe to use. */
export type DeckIntent = "teach" | "decide" | "report" | "promo" | "academic" | "travel";
/**
 * Strip “不要做成经营月报 / 不要做成课件 / 不是产品立项 / 不要个人答辩”
 * so the negation is not a document type.
 * 「开题 + 小学」is a defense, not courseware. 「发布会」is promo, not a lesson.
 */
export declare function briefWithoutNegatedDocTypes(brief: string): string;
/** Page-plan kind. Not a Host design-system pick. */
export type BriefKind = "cover-only" | "board-h1" | "product-intro" | "retail-monthly" | "performance-review" | "work-report" | "project-proposal" | "academic" | "teach-pythagoras" | "teaching" | "training" | "learn-share" | "other";
/**
 * Director page-plan kind after negations are stripped.
 * 董事会半年经营汇报 is not 立项 and not a 20-page 澄光月报.
 * 不要做成经营月报 is not a monthly. 产品介绍 / 办公立项用 is not a monthly.
 * 开题/答辩 is academic, not 勾股 courseware.
 * 学习分享 / 分享会 / 内部分享 is not other, not 澄光月报, not 立项.
 */
export declare function classifyBriefKind(brief: string): BriefKind;
export declare function inferDeckIntent(brief: string, categoryId?: string): DeckIntent;
/** Named classroom facts the host may state without a citation. Not every teach brief. */
export declare function isNamedClassroomFact(text: string): boolean;
//# sourceMappingURL=compose-ir.d.ts.map