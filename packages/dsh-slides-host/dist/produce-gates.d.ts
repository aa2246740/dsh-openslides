import { type ProduceGateReport } from "@open-slidestudio/presentation-run";
export declare class StaleProduceGatesError extends Error {
    readonly report: HubProduceGateReport;
    readonly name = "StaleProduceGatesError";
    readonly code = "stale_produce_gates";
    constructor(report: HubProduceGateReport, detail?: string);
}
export type HubProduceGateReport = ProduceGateReport & {
    readonly hashMatch: boolean;
    readonly workspaceHash?: string;
    readonly loadedHash?: string;
    readonly emptyWriteRejected: boolean;
    readonly emptyCreateHasNoSeed: boolean;
    readonly generateReady: boolean;
};
export declare function emptyWriteIsRejectedByLoadedHost(): boolean;
export declare function emptyCreateHasNoSeedFromLoadedPptd(): boolean;
export declare function inspectHubProduceGates(workspaceRoot?: string): HubProduceGateReport;
export declare function assertHubProduceGatesReady(workspaceRoot?: string): HubProduceGateReport;
//# sourceMappingURL=produce-gates.d.ts.map