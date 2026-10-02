import type { ModelInputModality } from "@open-slidestudio/presentation-run";
export { assertIsolatedDshHome, userDshHome } from "./isolation.js";
export declare const SLIDES_MODEL_CATALOG_FILENAME = "slides-model-catalog.json";
export type RuntimeModelInfo = {
    readonly name: string;
    readonly inputModalities: readonly ModelInputModality[];
    readonly efforts?: readonly string[];
};
export type RuntimeModelCatalog = ReadonlyMap<string, ReadonlyMap<string, RuntimeModelInfo>>;
export declare function isAntigravityId(value: string): boolean;
export type ImportedProvider = {
    readonly id: string;
    readonly name: string;
    readonly apiKeyEnv?: string;
    readonly models: readonly string[];
    readonly ready: boolean;
    readonly profile?: Record<string, unknown>;
};
export type SlidesModelCatalog = {
    readonly sourceHome: string;
    readonly destHome: string;
    readonly excluded: readonly string[];
    readonly oauthSkipped: readonly string[];
    readonly defaultProvider: string;
    readonly defaultModel: string;
    readonly providers: readonly ImportedProvider[];
};
/**
 * Operator-added providers that must survive every regeneration of the
 * isolated home. Full pi-ai profiles (baseURL, api, models) live here; the
 * key itself is stored through the product (credentials/<id>.key).
 */
export declare const LOCAL_PROVIDERS_FILENAME = "slides-providers.local.json";
export type ImportLocalDshModelsInput = {
    readonly sourceHome?: string;
    readonly destHome: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly userHomeDir?: string;
};
/**
 * BYOK/local providers must land in two places: `slides-providers.local.json`
 * so they survive the next importLocalDshModels regeneration, and the live
 * settings.yaml llm-pi-ai.providers block so the kernel can resolve the
 * provider id on the very next agent create/resume — not only after re-import.
 */
export type LocalProviderProfile = {
    readonly id: string;
    readonly name?: string;
    readonly apiKeyEnv?: string;
    readonly baseURL: string;
    readonly api?: string;
    readonly models: readonly string[];
};
export declare function upsertLocalProviderProfile(destHome: string, input: LocalProviderProfile): void;
export declare function removeLocalProviderProfile(destHome: string, id: string): void;
export type ImportLocalDshModelsResult = {
    readonly catalog: SlidesModelCatalog;
    readonly envBindings: Record<string, string>;
};
/**
 * Read only explicit input metadata for one exact provider/model route.
 *
 * A live catalog is authoritative, including empty or missing metadata.
 * Only older runtimes without that API use the home profile's declarations.
 */
export declare function modelInputModalities(home: string, providerId: string, modelId: string, modelCatalog?: RuntimeModelCatalog): readonly ModelInputModality[] | undefined;
/** Read the `input:` list declared on one model inside the home's settings profile. */
export declare function modelInputModalitiesFromHome(home: string, providerId: string, modelId: string): readonly ModelInputModality[] | undefined;
/**
 * Union of reasoningEffort ids declared by this provider's models in the
 * isolated home settings. Return value semantics:
 *   undefined → profile does not declare models (unknown; keep client default)
 *   []        → models declared WITHOUT any reasoningEfforts (unsupported)
 *   [ids]     → supported efforts
 */
export declare function providerReasoningEffortsFromHome(home: string, providerId: string): readonly string[] | undefined;
/**
 * Per-model reasoning levels exactly as the profile declares them.
 *
 * A provider-wide union cannot answer "does THIS model take an effort", and the
 * kernel validates the effort against the resolved model — so a surface that
 * only knows the union either hides levels a model does support or sends one to
 * a model that refuses it. Semantics per model id:
 *   missing   → the profile says nothing about that model (unknown; keep the
 *               provider-wide answer)
 *   []        → the model declares `reasoningEfforts: false` (supports none)
 *   [ids]     → exactly the levels that model offers
 * Returns undefined when the profile declares no models at all.
 */
export declare function providerModelEffortsFromHome(home: string, providerId: string): Record<string, readonly string[]> | undefined;
/**
 * The effort to actually send for one model: never one the model declares it
 * cannot take, and never a guess when the profile is silent.
 */
export declare function reasoningEffortForModel(home: string, providerId: string, modelId: string, requested?: string, catalog?: RuntimeModelCatalog): string | undefined;
export type MimoDesktopEndpoint = {
    readonly baseURL: string;
    readonly token: string;
    readonly directory: string;
};
/**
 * Mint our own token inside the MiMo Desktop token store — the gateway
 * validates Bearer tokens against exactly this store. Used only when the
 * isolated home has no usable credential yet.
 */
export declare function mintMimoDesktopToken(directory?: string): string;
/**
 * Discover the live MiMo Desktop engine (dynamic loopback port per app
 * session) by probing each Xiaomi listener with a known-good credential.
 * Minting is a fallback for a home that has no credential yet.
 */
export declare function discoverMimoDesktopEndpoint(directory?: string, knownKey?: string): Promise<MimoDesktopEndpoint | undefined>;
/**
 * Resolve the live MiMo Desktop gateway and align the isolated home with it.
 * Prefers the credential already in the isolated home; mints only when the
 * home has none. Returns the endpoint when the desktop engine answers.
 */
export declare function syncMimoDesktopProvider(destHome: string): Promise<MimoDesktopEndpoint | undefined>;
/**
 * Fast fail with the exact user action when the MiMo Desktop engine is not
 * reachable, instead of an opaque 404/502 in the middle of a turn.
 */
export declare function assertMimoDesktopGateway(destHome: string, fetchImpl?: typeof fetch): Promise<void>;
export declare function catalogPath(destHome: string): string;
export declare function loadSlidesModelCatalog(destHome: string): SlidesModelCatalog | undefined;
export declare function applyCatalogEnv(catalog: SlidesModelCatalog, env: NodeJS.ProcessEnv): void;
/**
 * Copy API-key providers from the local DSH App settings into an isolated
 * slides home. Never copies OAuth grant files. Drops Antigravity.
 */
export declare function importLocalDshModels(input: ImportLocalDshModelsInput): ImportLocalDshModelsResult;
//# sourceMappingURL=local-models.d.ts.map