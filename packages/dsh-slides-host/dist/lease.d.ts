export type KernelLease = {
    kernel: "dsh" | "pi";
    pid: number;
    sessionId?: string;
    startedAt: string;
};
export declare function readProjectLease(projectRoot: string): KernelLease | undefined;
export declare function acquireProjectLease(projectRoot: string, kernel: "dsh", sessionId?: string): KernelLease;
export declare function releaseProjectLease(projectRoot: string, kernel: "dsh"): void;
//# sourceMappingURL=lease.d.ts.map