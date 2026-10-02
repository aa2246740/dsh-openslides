import { inspectCapabilities, } from "@open-slidestudio/presentation-run";
export function hubCapabilityCard(input) {
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
//# sourceMappingURL=hub-capability.js.map