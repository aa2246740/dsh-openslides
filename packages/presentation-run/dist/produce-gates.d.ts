import { visualReviewIsClaimable } from "./capabilities.js";
import { isPlaceholderReviewIssue, isWritePageCloser, pageCoverage, pageHasVisibleContent, persistPageKey, persistPagePathFromId, pageIdMatchesFile, tableEmptyCellIssues, writePageSchemaError, writePageSchemaIssues, composedPageLeftoverIssues, renderedLayoutBlocksCompose } from "./domain/layout-qa.js";
export declare const PRODUCE_GATES_ID = "edith-twenty-five-v1";
export declare const PRODUCE_GATE_REL_FILES: readonly ["packages/presentation-run/dist/produce-gates.js", "packages/presentation-run/dist/domain/layout-qa.js", "packages/presentation-run/dist/domain/compose-ir.js", "packages/presentation-run/dist/domain/theme-pack.js", "packages/presentation-run/dist/domain/agent-tools.js", "packages/presentation-run/dist/domain/run-ledger.js", "packages/presentation-run/dist/domain/page-raster.js", "packages/presentation-run/dist/capabilities.js", "packages/dsh-slides-host/dist/write-page.js", "packages/dsh-slides-host/dist/tools.js", "packages/dsh-slides-host/dist/director-brief.js", "packages/pptd-v2/dist/parse.js", "packages/pptd-v2/dist/theme.js", "packages/exporter-native/dist/export-pptd.js"];
export type ProduceGateApi = {
    pageHasVisibleContent: typeof pageHasVisibleContent;
    pageCoverage: typeof pageCoverage;
    persistPageKey: typeof persistPageKey;
    persistPagePathFromId: typeof persistPagePathFromId;
    pageIdMatchesFile: typeof pageIdMatchesFile;
    tableEmptyCellIssues: typeof tableEmptyCellIssues;
    writePageSchemaIssues: typeof writePageSchemaIssues;
    writePageSchemaError: typeof writePageSchemaError;
    isWritePageCloser: typeof isWritePageCloser;
    visualReviewIsClaimable: typeof visualReviewIsClaimable;
    isPlaceholderReviewIssue: typeof isPlaceholderReviewIssue;
    composedPageLeftoverIssues: typeof composedPageLeftoverIssues;
    renderedLayoutBlocksCompose: typeof renderedLayoutBlocksCompose;
    EMPTY_CLOSER_PRODUCE_NEXT: string;
    HOST_SEED_PRODUCE_NEXT: string;
};
export type ProduceGateReport = {
    readonly ok: boolean;
    readonly id: string;
    readonly missing: readonly string[];
    readonly failed: readonly string[];
};
export declare function inspectProduceGates(api?: ProduceGateApi): ProduceGateReport;
export declare function assertProduceGates(api?: ProduceGateApi): ProduceGateReport;
//# sourceMappingURL=produce-gates.d.ts.map