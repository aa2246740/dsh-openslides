export type GateAcquire = {
    readonly ok: true;
    readonly release: () => void;
} | {
    readonly ok: false;
    readonly busyWith: string;
};
/**
 * At most one in-flight page step per session.
 * Extra parallel calls are refused so the model must wait for the current
 * write/render/review result. Prompt text cannot enforce this.
 */
export declare class ExclusiveSessionGate {
    private readonly busy;
    tryAcquire(sessionId: string, toolName: string): GateAcquire;
}
export declare const writePageGate: ExclusiveSessionGate;
export declare const reviewPageGate: ExclusiveSessionGate;
/**
 * One write_page persist at a time per Hub session.
 * Parallel model tool calls still return independently; they just cannot
 * interleave PPTD disk writes. Prompt text cannot enforce this.
 */
export declare class WritePageSerialQueue {
    private readonly tails;
    enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T>;
}
export declare const writePageSerial: WritePageSerialQueue;
//# sourceMappingURL=write-page-serial.d.ts.map