export { OFFICIAL_VISUAL_ROW_IDS, KEPT_SHELL_ROW_IDS } from "./visual-rows.js";
export declare const DSH_PIN: {
    readonly version: "0.2.0-rc.2";
    readonly tag: "dsh-v0.2.0-rc.2";
    /** Upstream tag dsh-v0.2.0-rc.2 in github.com/deepseek-ai/deepseek-harness (git ls-remote). */
    readonly commit: "639ed015397290b3745d163aafe02ffee4aa3f84";
    /** Registry pin evidence: package-lock `integrity` for the tarball below. */
    readonly integrity: "sha512-EAJ3gPNcVt/uv8X19PMm9NkVhWgT7xXNMk0UKCVm+IQ5rpSQOcsMUa0HWlnYYVybKMsccjcRB21vVVsaXQ6IdA==";
    readonly tarball: "https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.0-rc.2.tgz";
};
export declare const OAUTH_LOGIN_NOTE: {
    readonly npmVersion: "0.1.9";
    readonly localTree: "dirty";
    readonly pin: false;
};
export declare const SLIDES_PROFILE_BUNDLES: readonly ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@open-slidestudio/dsh-slides-bundle"];
export type EntryLike = {
    readonly id?: string;
    readonly name?: string;
    readonly disabled?: boolean;
    readonly config?: Record<string, unknown>;
};
export declare class SlidesRowLawError extends Error {
    readonly clause: string;
    readonly name = "SlidesRowLawError";
    constructor(clause: string, detail: string);
}
export declare function assertSlidesRowLaw(entries: readonly EntryLike[]): void;
export declare function writeSlidesProfile(home: string, repoRoot: string): string;
//# sourceMappingURL=index.d.ts.map