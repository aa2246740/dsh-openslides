export type CapabilityFate = "preserved" | "dsh-native" | "adapted" | "dev-only";
export type CapabilityLedgerRow = {
    readonly id: string;
    readonly owner: "presentation-run" | "dsh-slides-host" | "dsh" | "agent-harness-fixture";
    readonly fate: CapabilityFate;
    readonly notes: string;
};
/**
 * Existing generate capabilities mapped before any production export is deleted.
 * Silent drops are forbidden.
 */
export declare const CAPABILITY_LEDGER: readonly CapabilityLedgerRow[];
export declare function ledgerFate(id: string): CapabilityLedgerRow | undefined;
//# sourceMappingURL=capability-ledger.d.ts.map