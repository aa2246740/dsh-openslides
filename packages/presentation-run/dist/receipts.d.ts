import type { SourceReceipt } from "./types.js";
export declare function listSourceReceipts(projectRoot: string): SourceReceipt[];
export declare function recordSourceReceipt(projectRoot: string, receipt: SourceReceipt): SourceReceipt[];
export declare function consultedAdoptedExecuted(projectRoot: string): {
    consulted: number;
    adopted: number;
    executed: number;
};
export declare function requireConsultAdoptBeforeWrite(projectRoot: string): string | undefined;
//# sourceMappingURL=receipts.d.ts.map