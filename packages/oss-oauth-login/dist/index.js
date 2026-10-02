/**
 * Open SlideStudio OAuth wrapper around dsh-oauth-login.
 * Separate plugin id and credential filename so it cannot overwrite DSH App grants.
 */
import path from "node:path";
import { Config, createPiLoginAdapter, OAUTH_REFRESH_POLL_MS, PiLoginCredentialStore, PiLoginSession, piLoginRoutes, registerPiLoginAuthRoutes, } from "dsh-oauth-login";
import os from "node:os";
import fs from "node:fs";
function isolatedHome(home) {
    const resolved = path.resolve(home.trim() || ".");
    const userDsh = path.resolve(os.homedir(), ".dsh");
    let root = userDsh;
    let leaf = resolved;
    try {
        if (fs.existsSync(userDsh))
            root = fs.realpathSync(userDsh);
    }
    catch {
        root = userDsh;
    }
    try {
        if (fs.existsSync(resolved))
            leaf = fs.realpathSync(resolved);
    }
    catch {
        leaf = resolved;
    }
    const rel = path.relative(root, leaf);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
        throw new Error(`oss-oauth-login refused DSH_HOME ${resolved}: that is the local DSH App home. Use <repo>/.dsh/home.`);
    }
    return resolved;
}
export const name = "oss-oauth-login";
export const inject = ["llm"];
export { Config };
export const OSS_OAUTH_AUTH_FILENAME = ".oss-oauth-auth.json";
export const OSS_OAUTH_PLUGIN_ID = "oss-oauth-login";
async function syncAuthenticatedRoutes(session, registration) {
    const routes = (await session.authenticatedRoutes()).filter((route) => !/antigravity|\bagy-/i.test(route));
    registration.replace(routes);
}
export function apply(ctx, config = {}) {
    const home = isolatedHome(process.env.DSH_HOME?.trim() || "");
    const storePath = path.join(home, OSS_OAUTH_AUTH_FILENAME);
    const native = {
        enabled: config.nativeTools !== false,
        image: config.nativeImage !== false,
    };
    const session = new PiLoginSession(new PiLoginCredentialStore(storePath), native);
    const routes = piLoginRoutes().filter((route) => !/antigravity|\bagy-/i.test(route));
    const registration = ctx.llm.registerAdapter(routes, createPiLoginAdapter(session, () => ctx.get("attachments"), {
        streamIdleTimeoutMs: config.streamIdleTimeoutMs,
        retryPolicy: config.retryPolicy,
    }));
    const refreshRoutes = () => syncAuthenticatedRoutes(session, registration);
    void refreshRoutes().catch((error) => {
        console.warn("[open-slidestudio/oss-oauth-login] initial route sync failed:", error instanceof Error ? error.message : error);
    });
    ctx.effect(() => {
        const stop = session.openRouter.subscribe(() => {
            void refreshRoutes().catch(() => undefined);
        });
        void session.openRouter.syncAuthentication().catch(() => {
            console.warn("[open-slidestudio/oss-oauth-login] OpenRouter catalog init failed");
        });
        return async () => {
            stop();
            session.openRouter.dispose();
            await session.proxy.dispose();
        };
    }, "oss-oauth-login: OpenRouter catalog");
    ctx.effect(() => {
        const timer = setInterval(() => {
            void session.refreshStoredGrants().catch(() => undefined);
        }, OAUTH_REFRESH_POLL_MS);
        void session.refreshStoredGrants().catch(() => undefined);
        return () => clearInterval(timer);
    }, "oss-oauth-login: refresh oauth grants");
    ctx.inject(["webServer", "connection"], (webCtx) => {
        registerPiLoginAuthRoutes(webCtx, session, { onAuthChanged: refreshRoutes });
    });
    console.log(`[open-slidestudio/oss-oauth-login] loaded store=${storePath}`);
}
//# sourceMappingURL=index.js.map