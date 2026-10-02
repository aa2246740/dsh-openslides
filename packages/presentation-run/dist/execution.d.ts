import type { CapabilitySnapshot, ExecutionDelivery, ExecutionProjection } from "./types.js";
import type { RunLedgerInspection, RunLedgerV1 } from "./domain/run-ledger.js";
import type { ProjectIdentityResolution } from "./domain/page-identity.js";
export type ProjectExecutionInput = Readonly<{
    ledger?: RunLedgerV1;
    identity: ProjectIdentityResolution;
    inspection: RunLedgerInspection;
    /** Undefined means unknown. Only the Host's live observation may establish idle. */
    agentBusy?: boolean;
    retryScheduled?: boolean;
    exporting?: boolean;
    capability: CapabilitySnapshot;
    binding?: {
        readonly provider?: {
            readonly providerId: string;
            readonly modelId: string;
            readonly reasoningEffort?: string;
        };
        readonly design?: {
            readonly kind: "self-directed";
        } | {
            readonly kind: "explicit-style";
            readonly designSystemId: string;
        };
        readonly brief?: string;
    };
    terminalFault?: {
        readonly attemptId?: string;
        readonly code?: string;
        readonly message?: string;
        readonly phase?: string;
        readonly recoverable?: boolean;
        readonly retryAfterMs?: number;
    };
    currentAttemptId?: string | null;
    /** Supplied only after the current-operation receipt and its actual files are verified. */
    verifiedDelivery?: ExecutionDelivery | null;
}>;
/** Pure projection over supplied observations. No filesystem, clock, environment, or writes. */
export declare function projectExecution(input: ProjectExecutionInput): ExecutionProjection;
//# sourceMappingURL=execution.d.ts.map