import fs from "node:fs";
import os from "node:os";
import path from "node:path";
/** DSH.app's well-known default web port. Slides must not bind this. */
export const DSH_APP_DEFAULT_PORT = 3080;
/** Product Hub port. Distinct from DSH.app (3080 / whatever App spawned). */
export const SLIDES_DSH_PORT_DEFAULT = 13080;
export const OAUTH_ISOLATION_FILENAMES = [
    ".dsh-oauth-auth.json",
    ".pi-login-auth.json",
    ".dsh-antigravity-oauth.json",
    ".dsh-oauth-proxy.json",
];
export function userDshHome(homeDir = os.homedir()) {
    return path.resolve(homeDir, ".dsh");
}
function resolveExistingPrefix(target) {
    let current = path.resolve(target);
    const missing = [];
    while (!fs.existsSync(current)) {
        missing.unshift(path.basename(current));
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    try {
        current = fs.realpathSync(current);
    }
    catch {
        current = path.resolve(current);
    }
    return missing.length > 0 ? path.join(current, ...missing) : current;
}
export function isPathInside(parent, child) {
    const root = resolveExistingPrefix(parent);
    const leaf = resolveExistingPrefix(child);
    const rel = path.relative(root, leaf);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
export class DshHomeIsolationError extends Error {
    name = "DshHomeIsolationError";
    constructor(detail) {
        super(detail);
    }
}
/**
 * Slides DSH_HOME must be a private tree. Sharing ~/.dsh with DSH.app
 * would let a refresh rotate the App's OAuth grants.
 */
export function assertIsolatedDshHome(home, opts = {}) {
    const resolved = path.resolve(home.trim() || ".");
    const userHome = path.resolve(opts.userDshHome ?? userDshHome());
    if (isPathInside(userHome, resolved) || isPathInside(resolved, userHome)) {
        throw new DshHomeIsolationError(`DSH_HOME ${resolved} collides with the local DSH App home ${userHome}. Open SlideStudio must use <repo>/.dsh/home. Did not copy OAuth grants.`);
    }
    return resolved;
}
export function assertNotOauthIsolationFile(filename) {
    const base = path.basename(filename);
    if (OAUTH_ISOLATION_FILENAMES.includes(base)) {
        throw new DshHomeIsolationError(`refusing to copy ${base}: OAuth grants stay in the local DSH App home`);
    }
}
//# sourceMappingURL=isolation.js.map