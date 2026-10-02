import { type CapabilitySnapshot, type ModelInputModality } from "@open-slidestudio/presentation-run";
export type HubCapabilityCard = CapabilitySnapshot;
export declare function hubCapabilityCard(input: {
    readonly providerId: string;
    readonly ready: boolean;
    readonly modelId?: string;
    readonly modelInputModalities?: readonly ModelInputModality[];
    readonly env?: NodeJS.ProcessEnv;
    readonly rasterReady?: boolean;
    readonly nativeSearch?: boolean;
}): HubCapabilityCard;
//# sourceMappingURL=hub-capability.d.ts.map