/** DSH.app's well-known default web port. Slides must not bind this. */
export declare const DSH_APP_DEFAULT_PORT = 3080;
/** Product Hub port. Distinct from DSH.app (3080 / whatever App spawned). */
export declare const SLIDES_DSH_PORT_DEFAULT = 13080;
export declare const OAUTH_ISOLATION_FILENAMES: readonly [".dsh-oauth-auth.json", ".pi-login-auth.json", ".dsh-antigravity-oauth.json", ".dsh-oauth-proxy.json"];
export declare function userDshHome(homeDir?: string): string;
export declare function isPathInside(parent: string, child: string): boolean;
export type IsolatedHomeOpts = {
    readonly userDshHome?: string;
};
export declare class DshHomeIsolationError extends Error {
    readonly name = "DshHomeIsolationError";
    constructor(detail: string);
}
/**
 * Slides DSH_HOME must be a private tree. Sharing ~/.dsh with DSH.app
 * would let a refresh rotate the App's OAuth grants.
 */
export declare function assertIsolatedDshHome(home: string, opts?: IsolatedHomeOpts): string;
export declare function assertNotOauthIsolationFile(filename: string): void;
//# sourceMappingURL=isolation.d.ts.map