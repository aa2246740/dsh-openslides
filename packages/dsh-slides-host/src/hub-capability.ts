import {
  inspectCapabilities,
  type CapabilitySnapshot,
  type ModelInputModality,
} from "@open-slidestudio/presentation-run";

export type HubCapabilityCard = CapabilitySnapshot;

export function hubCapabilityCard(input: {
  readonly providerId: string;
  readonly ready: boolean;
  readonly modelId?: string;
  readonly modelInputModalities?: readonly ModelInputModality[];
  readonly env?: NodeJS.ProcessEnv;
  readonly rasterReady?: boolean;
  readonly nativeSearch?: boolean;
}): HubCapabilityCard {
  return inspectCapabilities({
    env: input.env ?? process.env,
    providerId: input.providerId,
    modelId: input.modelId,
    modelInputModalities: input.modelInputModalities,
    ready: input.ready,
    rasterReady: input.rasterReady,
    nativeSearch: input.nativeSearch,
  });
}
