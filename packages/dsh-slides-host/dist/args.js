import fs from "node:fs";
import path from "node:path";
import { GROK_PROVIDER, OSS_OAUTH_PROVIDERS, signedInOauthRoutes } from "./oauth-login.js";
import { isAntigravityId, loadSlidesModelCatalog, } from "./local-models.js";
import { readByokProviders } from "./byok.js";
function asRecord(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return undefined;
}
function unwrapMiniMax(value, depth = 0) {
    if (depth > 8 || value == null)
        return value;
    if (Array.isArray(value))
        return value.map((row) => unwrapMiniMax(row, depth + 1));
    const rec = asRecord(value);
    if (!rec)
        return value;
    if (Object.keys(rec).length === 1 && "item" in rec)
        return unwrapMiniMax(rec.item, depth + 1);
    if (Object.keys(rec).length === 1 && "items" in rec)
        return unwrapMiniMax(rec.items, depth + 1);
    return value;
}
/** Models often wrap the plan as `{ items: [...] }` or MiniMax `{ items: { item: T } }`. */
export function coerceSlidePlan(raw) {
    const nested = unwrapMiniMax(raw);
    if (Array.isArray(nested))
        return nested;
    const inner = asRecord(nested);
    if (!inner)
        return [];
    if ("pageId" in inner || "id" in inner)
        return [inner];
    const items = unwrapMiniMax(inner.items ?? inner.pages ?? inner.slidePlan);
    if (Array.isArray(items))
        return items;
    if (items && typeof items === "object")
        return [items];
    return [];
}
export const SLIDES_LLM_PROVIDER = "minimax-cn";
export const SLIDES_LLM_DEFAULT_MODEL = "MiniMax-M3";
export const SLIDES_LLM_FALLBACK_MODEL = "MiniMax-M2.7";
/** @deprecated Product generate is no longer MiniMax-only. Kept for old callers. */
export const SLIDES_LLM_ALLOWED_MODELS = [
    SLIDES_LLM_DEFAULT_MODEL,
    SLIDES_LLM_FALLBACK_MODEL,
];
export const SLIDES_LLM_API_KEY_ENV = "MINIMAX_CN_API_KEY";
export const SLIDES_LLM_CN_HOST = "api.minimaxi.com";
/** Personal Cloud Agent secret name (no underscore). Same key as MINIMAX_CN_API_KEY. */
export const SLIDES_LLM_CN_KEY_ENV_CLOUD = "MINIMAXCN_API_KEY";
export const SLIDES_LLM_CN_KEY_ENV_ALIAS = "MINIMAX_API_KEY";
export const OPENROUTER_PROVIDER = "openrouter";
export const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";
export const OPENROUTER_FREE_API_KEY_ENV = "OPENROUTER_ONLYUSE_FREEMODEL_API_KEY";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_MINIMAX_FREE_MODEL = "minimax/minimax-m3:free";
export const OPENROUTER_MINIMAX_FREE_FALLBACK_MODEL = "minimax/minimax-m2.7:free";
export const MINIMAX_CN_KEY_ENV_NAMES = [
    SLIDES_LLM_API_KEY_ENV,
    SLIDES_LLM_CN_KEY_ENV_CLOUD,
    SLIDES_LLM_CN_KEY_ENV_ALIAS,
];
export function agentOptionsForRoute(route) {
    return { provider: route.provider, model: route.model };
}
/** Process-local generate route flags. Failover no longer prefers OpenRouter free. */
export const generateRouteState = {
    minimaxCnAuthFailed: false,
    openrouterHardFailed: false,
    grokFailed: false,
};
export function resetGenerateRouteState() {
    generateRouteState.minimaxCnAuthFailed = false;
    generateRouteState.openrouterHardFailed = false;
    generateRouteState.grokFailed = false;
}
export function markGrokFailed() {
    generateRouteState.grokFailed = true;
}
export function markMinimaxCnAuthFailed() {
    generateRouteState.minimaxCnAuthFailed = true;
}
export function markOpenRouterHardFailed() {
    generateRouteState.openrouterHardFailed = true;
}
export class RejectedGenerateModelError extends Error {
    name = "RejectedGenerateModelError";
    constructor(detail) {
        super(detail);
    }
}
function catalogFor(opts) {
    if (opts?.catalog)
        return opts.catalog;
    const home = opts?.home?.trim() || process.env.DSH_HOME?.trim();
    if (home)
        return loadSlidesModelCatalog(home);
    return undefined;
}
export function isForbiddenGenerateRoute(provider, model = "") {
    return isAntigravityId(provider) || isAntigravityId(model);
}
function withGrokTools(route) {
    if (route.provider !== GROK_PROVIDER)
        return route;
    return { ...route, nativeTools: true };
}
function providerMarkedFailed(provider) {
    if (provider === GROK_PROVIDER)
        return generateRouteState.grokFailed;
    if (provider === OPENROUTER_PROVIDER)
        return generateRouteState.openrouterHardFailed;
    if (provider === SLIDES_LLM_PROVIDER)
        return generateRouteState.minimaxCnAuthFailed;
    return false;
}
function defaultModelForProvider(provider, fallback) {
    if (provider === SLIDES_LLM_PROVIDER)
        return SLIDES_LLM_DEFAULT_MODEL;
    if (provider === OPENROUTER_PROVIDER)
        return OPENROUTER_MINIMAX_FREE_MODEL;
    return fallback;
}
export function resolveSlidesLlmRoute(env = process.env, opts) {
    bindMinimaxCnKey(env);
    const catalog = catalogFor(opts);
    const explicitProvider = Boolean(opts?.provider?.trim() || env.SLIDESTUDIO_LLM_PROVIDER?.trim());
    let provider = opts?.provider?.trim() ||
        env.SLIDESTUDIO_LLM_PROVIDER?.trim() ||
        catalog?.defaultProvider ||
        SLIDES_LLM_PROVIDER;
    let model = opts?.model?.trim() ||
        env.SLIDESTUDIO_LLM_MODEL?.trim() ||
        catalog?.defaultModel ||
        SLIDES_LLM_DEFAULT_MODEL;
    // A dead provider only loses its default slot; an explicitly configured route
    // must surface its own credential error instead of being silently rerouted.
    if (!explicitProvider && providerMarkedFailed(provider)) {
        for (const candidate of [SLIDES_LLM_PROVIDER, OPENROUTER_PROVIDER]) {
            if (candidate === provider || providerMarkedFailed(candidate))
                continue;
            const route = { provider: candidate, model: defaultModelForProvider(candidate, model) };
            if (!keyPresentForRoute(route, env, opts))
                continue;
            provider = candidate;
            if (!opts?.model?.trim() && !env.SLIDESTUDIO_LLM_MODEL?.trim()) {
                model = route.model;
            }
            break;
        }
    }
    if (isForbiddenGenerateRoute(provider, model)) {
        throw new RejectedGenerateModelError(`Antigravity generate is rejected (${provider}/${model}). Import local DSH models except Antigravity.`);
    }
    return withGrokTools({ provider, model });
}
function hostnameOf(url) {
    try {
        return new URL(url).hostname;
    }
    catch {
        return undefined;
    }
}
function firstNonempty(values) {
    for (const value of values) {
        const trimmed = value?.trim() ?? "";
        if (trimmed)
            return trimmed;
    }
    return "";
}
/** First nonempty MiniMax China key: MINIMAX_CN_API_KEY, MINIMAXCN_API_KEY, MINIMAX_API_KEY. */
export function readMinimaxCnKey(env = process.env) {
    const host = hostnameOf(env.SLIDESTUDIO_LLM_BASE_URL?.trim() ?? "");
    const compat = host === SLIDES_LLM_CN_HOST ? env.SLIDESTUDIO_LLM_API_KEY?.trim() : "";
    return firstNonempty([
        env.MINIMAX_CN_API_KEY,
        env.MINIMAXCN_API_KEY,
        env.MINIMAX_API_KEY,
        compat,
    ]);
}
export function bindMinimaxCnKey(env = process.env) {
    const value = readMinimaxCnKey(env);
    if (!value)
        return;
    env.MINIMAX_CN_API_KEY = value;
    env.MINIMAXCN_API_KEY = value;
    env.MINIMAX_API_KEY = value;
}
export function minimaxCnKeyPresent(env = process.env) {
    return Boolean(readMinimaxCnKey(env));
}
export function openrouterKeyPresent(env = process.env) {
    return Boolean(env.OPENROUTER_API_KEY?.trim() || env.OPENROUTER_ONLYUSE_FREEMODEL_API_KEY?.trim());
}
export function modelForRoute(route, requested) {
    const named = requested?.trim();
    if (named)
        return named;
    return route.model;
}
export const MINIMAX_GENERATE_ENV_NAMES = [
    "MINIMAX_CN_API_KEY",
    "MINIMAXCN_API_KEY",
    "MINIMAX_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENROUTER_ONLYUSE_FREEMODEL_API_KEY",
    "AMD_API_KEY",
    "OP_CUSTOM_API_KEY",
    "SLIDESTUDIO_LLM_BASE_URL",
    "SLIDESTUDIO_LLM_API_KEY",
    "SLIDESTUDIO_LLM_MODEL",
    "SLIDESTUDIO_LLM_PROVIDER",
];
function keyPresentForRoute(route, env, opts) {
    if (route.provider === GROK_PROVIDER)
        return opts?.xai?.status === "signed-in";
    if (route.provider === SLIDES_LLM_PROVIDER)
        return minimaxCnKeyPresent(env);
    if (route.provider === OPENROUTER_PROVIDER)
        return openrouterKeyPresent(env);
    if (route.provider === "amd")
        return Boolean(env.AMD_API_KEY?.trim());
    if (route.provider === "op-custom")
        return Boolean(env.OP_CUSTOM_API_KEY?.trim());
    // Subscription adapters use their grant, even if an imported profile has
    // a same-id API-key declaration. Match slidesProviders' readiness rule.
    if (OSS_OAUTH_PROVIDERS.some((provider) => provider.route === route.provider)) {
        return opts?.home ? signedInOauthRoutes(opts.home).some((row) => row.route === route.provider) : false;
    }
    const catalog = catalogFor(opts);
    const row = catalog?.providers.find((item) => item.id === route.provider);
    if (row?.apiKeyEnv)
        return Boolean(env[row.apiKeyEnv]?.trim());
    // Keyless-by-declaration catalog rows (local gateways that authenticate
    // themselves) match the roster's ready rule in providers.ts.
    if (row && row.ready)
        return true;
    // BYOK providers are registered in slides-byok.json (and the local extras
    // file), not the generated catalog — resolve their env slot directly, with
    // the credentials/<id>.key store as the on-disk source of truth.
    const home = opts?.home?.trim() || process.env.DSH_HOME?.trim();
    if (home) {
        const byok = readByokProviders(home).find((item) => item.id === route.provider);
        if (byok) {
            return Boolean(env[byok.apiKeyEnv]?.trim() ||
                fs.existsSync(path.join(home, "credentials", `${route.provider}.key`)));
        }
    }
    // OAuth adapter routes (pi-zai-coding-cn, pi-anthropic, ...) keep their
    // credential in the dsh-oauth-login store of this home.
    if (String(route.provider).startsWith("pi-")) {
        return opts?.home ? signedInOauthRoutes(opts.home).some((row) => row.route === route.provider) : false;
    }
    return false;
}
export function assertSlidesGenerateReady(env = process.env, opts) {
    bindMinimaxCnKey(env);
    const route = resolveSlidesLlmRoute(env, opts);
    if (route.provider === SLIDES_LLM_PROVIDER) {
        const host = hostnameOf(env.SLIDESTUDIO_LLM_BASE_URL?.trim() ?? "");
        if (host && host !== SLIDES_LLM_CN_HOST) {
            throw new RejectedGenerateModelError(`MiniMax host must be official CN ${SLIDES_LLM_CN_HOST}, not ${host}.`);
        }
    }
    if (keyPresentForRoute(route, env, opts))
        return route;
    throw new RejectedGenerateModelError(`generate provider ${route.provider}/${route.model} has no credential in the isolated slides home. Antigravity was not used.`);
}
/** @deprecated Use assertSlidesGenerateReady. */
export function assertMinimaxCnGenerateReady(env = process.env) {
    return assertSlidesGenerateReady(env);
}
//# sourceMappingURL=args.js.map