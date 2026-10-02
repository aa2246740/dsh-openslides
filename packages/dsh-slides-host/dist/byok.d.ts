export declare const BYOK_FILENAME = "slides-byok.json";
export type ByokPreset = {
    readonly id: string;
    readonly name: string;
    readonly apiKeyEnv: string;
    readonly baseURL: string;
    readonly api: string;
    readonly models: readonly string[];
};
export type ByokProvider = {
    readonly id: string;
    readonly name: string;
    readonly apiKeyEnv: string;
    readonly baseURL: string;
    readonly api: string;
    readonly models: readonly string[];
    readonly userAdded: true;
};
export declare const BYOK_PRESETS: readonly ByokPreset[];
export declare function isAllowedApiKeyEnv(name: string): boolean;
export declare function byokFile(home: string): string;
export declare function readByokProviders(home: string): readonly ByokProvider[];
export declare function parseByokUpsert(value: unknown): ByokProvider;
export declare function upsertByokProvider(home: string, provider: ByokProvider): readonly ByokProvider[];
export declare function removeByokProvider(home: string, providerId: string): boolean;
//# sourceMappingURL=byok.d.ts.map