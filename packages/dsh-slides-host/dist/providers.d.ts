import { type RuntimeModelCatalog } from "./local-models.js";
export type ProviderDescriptor = {
    readonly id: string;
    readonly name: string;
    readonly methods: readonly ("api_key" | "oauth")[];
    readonly models: readonly string[];
    readonly ready?: boolean;
    /** Why a credentialed-looking provider is not actually selectable. */
    readonly readyReason?: string;
    /** Route works but its last real call failed transiently — listed with a warning. */
    readonly degraded?: boolean;
    readonly degradedReason?: string;
    /** True when this product home holds a saved key file for the provider. */
    readonly keyStored?: boolean;
    /** True when the signed-in route searches through provider-native server tools. */
    readonly nativeSearch?: boolean;
    readonly userAdded?: boolean;
    readonly baseURL?: string;
    /**
     * Declared reasoning-effort support. undefined = unknown (client keeps its
     * default), [] = this provider does not support efforts at all.
     */
    readonly efforts?: readonly string[];
    /**
     * The same answer per model id, so a surface can turn the effort control off
     * for the one model that supports none without hiding it for siblings that
     * do. Missing id = the profile is silent about that model.
     */
    readonly modelEfforts?: Readonly<Record<string, readonly string[]>>;
};
export declare function slidesProviders(home?: string): readonly ProviderDescriptor[];
/** The same model roster is used by the picker, health and execution guards. */
export declare function withDshModelCatalog(providers: readonly ProviderDescriptor[], catalog?: RuntimeModelCatalog): readonly ProviderDescriptor[];
export declare function slidesProviderHasModel(home: string, providerId: string, modelId: string, catalog?: RuntimeModelCatalog): boolean;
/** @deprecated Use slidesProviders(home). */
export declare const SLIDES_PROVIDERS: readonly ProviderDescriptor[];
export type ConnectionState = {
    readonly providerId: string;
    readonly ready: boolean;
    readonly method: "api_key" | "oauth" | "none";
    readonly source: "env" | "dsh-home" | "none";
    readonly model: string;
};
/** Remove every registered secret value from free text before it hits disk/UI. */
export declare function scrubRegisteredSecrets(text: string): string;
export declare function credentialsDir(home: string): string;
export declare function keyFile(home: string, providerId: string): string;
export declare function loadHomeKey(home: string, providerId: string): string | undefined;
export declare function saveHomeKey(home: string, providerId: string, apiKey: string): void;
export declare function deleteHomeKey(home: string, providerId: string): boolean;
export declare function bindHomeKeys(home: string, env?: NodeJS.ProcessEnv): void;
export declare function connectionState(home: string, env?: NodeJS.ProcessEnv, model?: string): ConnectionState;
export declare function assertNoSecretLeak(text: string, secrets: readonly string[]): void;
//# sourceMappingURL=providers.d.ts.map