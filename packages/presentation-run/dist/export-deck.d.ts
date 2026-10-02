import type { CommandContext, ExecutionDelivery } from "./types.js";
export declare function readVerifiedDelivery(root: string): ExecutionDelivery | null;
export declare function exportEditablePptx(projectRoot: string, context?: CommandContext | {
    toolCallId?: string;
    contextEpochId?: string;
    sessionId?: string;
}): Promise<{
    ok: boolean;
    summary: string;
    detail: string;
    payload: Record<string, unknown>;
}>;
//# sourceMappingURL=export-deck.d.ts.map