import type { SkillPageInput } from "./skill-pages.js";
export declare const NEED_DATA_REASON = "\u7ECF\u8425\u6708\u62A5\u9700\u8981\u516C\u53F8\u540D\u548C\u81F3\u5C11\u4E00\u7EC4\u5DF2\u6838\u5B9E\u6570\u5B57\u3002\u5F53\u524D brief \u4E0D\u8DB3\uFF0C\u62D2\u7EDD\u751F\u6210\uFF0C\u7981\u6B62\u7F16\u793A\u610F\u516C\u53F8\u6216\u793A\u610F KPI\u3002\u8BF7\u8865\u5145\u516C\u53F8\u540D\u4E0E\u6570\u636E\u540E\u518D\u8BD5\u3002";
export declare function reportBriefNeedsFacts(brief: string): boolean;
export declare function hasNamedCompany(text: string): boolean;
export declare function hasNumericFacts(text: string): boolean;
export declare function hasOperatingFacts(brief: string, referenceText?: string): boolean;
export declare function missingOperatingFactsReason(brief: string, referenceText?: string): string | undefined;
export declare function extractMarkedGaps(brief: string): string[];
export declare function extractRequiredTableColumns(brief: string): string[];
export declare function extractListedPeople(brief: string): string[];
export declare function skillPagesPlainText(pages: SkillPageInput[]): string;
export declare function missingLockedPageFacts(brief: string, pages: SkillPageInput[]): {
    pageId: string;
    missing: string[];
}[];
export type ReportFactIssue = {
    pageId: string;
    code: "unnamed_gap" | "missing_column" | "missing_locked_fact";
    message: string;
};
export declare function reportFactIssues(brief: string, pages: SkillPageInput[], referenceText?: string): ReportFactIssue[];
//# sourceMappingURL=report-facts.d.ts.map