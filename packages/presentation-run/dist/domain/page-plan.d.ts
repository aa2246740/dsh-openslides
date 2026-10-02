export declare const TODO_EXHIBIT_KINDS: readonly ["none", "chart:bar", "chart:line", "chart:pie", "chart:waterfall", "chart:scatter", "chart:combo", "table", "photo", "diagram:funnel", "diagram:gauge", "diagram:pyramid", "diagram:matrix", "diagram:timeline", "kpi-cards", "comparison-cards"];
export type TodoExhibitKind = (typeof TODO_EXHIBIT_KINDS)[number];
export declare function isTodoExhibitKind(value: unknown): value is TodoExhibitKind;
export type CanonicalPlanPage = Readonly<{
    pageId: string;
    title: string;
    layoutFamily: string;
    exhibits: readonly TodoExhibitKind[];
    note?: string;
    purpose?: string;
}>;
/** Validate explicit model-authored metadata; never infer a plan from page content. */
export declare function parseCanonicalPagePlan(raw: unknown): readonly CanonicalPlanPage[];
//# sourceMappingURL=page-plan.d.ts.map