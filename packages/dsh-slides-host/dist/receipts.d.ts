export type ToolCallReceipt = {
    readonly toolCallId: string;
    readonly commandHash: string;
    readonly outcome: unknown;
};
export declare function commandHash(name: string, args: unknown): string;
export declare function lookupToolReceipt(projectRoot: string, toolCallId: string): ToolCallReceipt | undefined;
export declare function recordToolReceipt(projectRoot: string, receipt: ToolCallReceipt): void;
//# sourceMappingURL=receipts.d.ts.map