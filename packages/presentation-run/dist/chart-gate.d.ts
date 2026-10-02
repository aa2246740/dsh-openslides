export type ChartGateResult = {
    readonly ok: true;
    readonly charts: number;
} | {
    readonly ok: false;
    readonly detail: string;
};
/**
 * OpenKimi PPTD charts are `data.cols` + `data.rows`. claim/dataRef/whyChart are
 * optional provenance, not a substitute for series data. A hollow chart must fail
 * closed instead of being silently dropped after write_page reports written.
 */
export declare function assertChartEvidence(args: Record<string, unknown>): ChartGateResult;
//# sourceMappingURL=chart-gate.d.ts.map