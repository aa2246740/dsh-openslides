/** xAI Grok login snapshot. Tokens never leave this module except as an image API key bind. */
export declare const GROK_PROVIDER: "pi-xai";
export declare const GROK_DEFAULT_MODEL: "grok-4.6";
export declare const GROK_PREFERRED_MODELS: readonly ["grok-4.6", "grok-4.5", "grok-4.3"];
export declare const XAI_API_BASE: "https://api.x.ai/v1";
export declare const XAI_IMAGE_MODEL: "grok-imagine-image-2.0";
export declare const OSS_OAUTH_AUTH_FILENAME = ".oss-oauth-auth.json";
export declare const OAUTH_AUTH_FILENAME = ".dsh-oauth-auth.json";
export declare const LEGACY_OAUTH_AUTH_FILENAME = ".pi-login-auth.json";
export type XaiLoginSnapshot = {
    readonly status: "signed-out";
} | {
    readonly status: "signed-in";
    readonly models: readonly string[];
};
export declare function grokModelFromCatalog(models: readonly string[]): string;
export declare function readXaiLoginSnapshot(home: string): XaiLoginSnapshot;
export declare function readXaiImageSecret(home: string): string | undefined;
export declare function bindGrokImageEnv(env: NodeJS.ProcessEnv, secret: string): void;
export declare function shouldFailoverGrok(providerId: string | undefined, error: {
    readonly code: string;
}): boolean;
export type OssOauthProvider = {
    readonly id: string;
    readonly route: string;
    readonly name: string;
    readonly models: readonly string[];
};
export declare const OSS_OAUTH_PROVIDERS: readonly OssOauthProvider[];
export declare function routeHasNativeSearch(route: string | undefined): boolean;
export declare function signedInOauthRoutes(home: string): readonly OssOauthProvider[];
//# sourceMappingURL=oauth-login.d.ts.map