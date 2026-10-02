/** xAI Grok login snapshot. Tokens never leave this module except as an image API key bind. */
import fs from "node:fs";
import path from "node:path";
export const GROK_PROVIDER = "pi-xai";
export const GROK_DEFAULT_MODEL = "grok-4.6";
export const GROK_PREFERRED_MODELS = ["grok-4.6", "grok-4.5", "grok-4.3"];
export const XAI_API_BASE = "https://api.x.ai/v1";
export const XAI_IMAGE_MODEL = "grok-imagine-image-2.0";
export const OSS_OAUTH_AUTH_FILENAME = ".oss-oauth-auth.json";
export const OAUTH_AUTH_FILENAME = ".dsh-oauth-auth.json";
export const LEGACY_OAUTH_AUTH_FILENAME = ".pi-login-auth.json";
const SIGNED_OUT = { status: "signed-out" };
function asRecord(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return undefined;
}
function stringList(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((row) => typeof row === "string" && row.trim().length > 0);
}
export function grokModelFromCatalog(models) {
    for (const preferred of GROK_PREFERRED_MODELS) {
        if (models.includes(preferred))
            return preferred;
    }
    const grok = models.find((id) => id.startsWith("grok-"));
    return grok ?? GROK_DEFAULT_MODEL;
}
/** OAuth access tokens carry `expires` (epoch ms); an expired grant is not signed in. */
function credentialUsable(cred, now = Date.now()) {
    if (cred.type === "oauth") {
        if (typeof cred.access !== "string" || cred.access.length === 0)
            return false;
        if (typeof cred.expires === "number" && Number.isFinite(cred.expires) && cred.expires <= now) {
            return false;
        }
        return true;
    }
    if (cred.type === "api_key")
        return typeof cred.key === "string" && cred.key.length > 0;
    return false;
}
function snapshotFromCredential(raw) {
    const cred = asRecord(raw);
    if (!cred || !credentialUsable(cred))
        return SIGNED_OUT;
    return { status: "signed-in", models: stringList(cred.availableModelIds) };
}
function readAuthDocument(home) {
    const files = [
        path.join(home, OSS_OAUTH_AUTH_FILENAME),
        path.join(home, OAUTH_AUTH_FILENAME),
        path.join(home, LEGACY_OAUTH_AUTH_FILENAME),
    ];
    for (const file of files) {
        if (!fs.existsSync(file))
            continue;
        try {
            const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
            const doc = asRecord(parsed);
            if (!doc || doc.version !== 1)
                continue;
            return doc;
        }
        catch {
            continue;
        }
    }
    return undefined;
}
export function readXaiLoginSnapshot(home) {
    const doc = readAuthDocument(home);
    if (!doc)
        return SIGNED_OUT;
    const credentials = asRecord(doc.credentials);
    if (!credentials)
        return SIGNED_OUT;
    return snapshotFromCredential(credentials.xai);
}
export function readXaiImageSecret(home) {
    const doc = readAuthDocument(home);
    if (!doc)
        return undefined;
    const credentials = asRecord(doc.credentials);
    const cred = asRecord(credentials?.xai);
    if (!cred)
        return undefined;
    if (typeof cred.access === "string" && cred.access.length > 0)
        return cred.access;
    if (typeof cred.key === "string" && cred.key.length > 0)
        return cred.key;
    return undefined;
}
export function bindGrokImageEnv(env, secret) {
    const token = secret.trim();
    if (!token)
        return;
    env.SLIDESTUDIO_IMAGE_BASE_URL = XAI_API_BASE;
    env.SLIDESTUDIO_IMAGE_MODEL = XAI_IMAGE_MODEL;
    env.SLIDESTUDIO_IMAGE_API_KEY = token;
    env.SLIDESTUDIO_IMAGE = "1";
}
export function shouldFailoverGrok(providerId, error) {
    if (providerId !== GROK_PROVIDER)
        return false;
    return error.code === "provider-auth" || error.code === "provider-quota";
}
export const OSS_OAUTH_PROVIDERS = [
    { id: "xai", route: GROK_PROVIDER, name: "Grok (xAI)", models: [...GROK_PREFERRED_MODELS] },
    {
        id: "openai-codex",
        route: "pi-openai-codex",
        name: "ChatGPT Codex",
        models: ["gpt-5.4", "gpt-5.3-codex", "gpt-5.3-codex-spark"],
    },
    {
        id: "anthropic",
        route: "pi-anthropic",
        name: "Claude Pro/Max",
        models: ["claude-opus-4-6", "claude-sonnet-4-6"],
    },
    {
        id: "github-copilot",
        route: "pi-github-copilot",
        name: "GitHub Copilot",
        models: ["gpt-5.4", "claude-sonnet-4.6"],
    },
    { id: "openrouter", route: "pi-openrouter", name: "OpenRouter", models: [] },
    { id: "kimi-coding", route: "pi-kimi-coding", name: "Kimi For Coding", models: ["kimi-for-coding", "k3"] },
    {
        id: "zai-coding-cn",
        route: "pi-zai-coding-cn",
        name: "智谱 GLM Coding Plan",
        models: ["glm-5.3-flash", "glm-5.3"],
    },
];
/**
 * DSH.app parity: model-native search first. Routes whose underlying provider
 * (xai, openai-codex, anthropic) carries a native search plan in dsh-oauth-login
 * execute search through provider-native server tools. The host mounts no
 * competing DSH function web_search for them. Other routes fall back to env URLs.
 * DSH model metadata does not declare hosted search; keep this route table
 * until the adapter API exposes it rather than inferring it from model names.
 */
const NATIVE_SEARCH_ROUTES = new Set([
    GROK_PROVIDER,
    "pi-openai-codex",
    "pi-anthropic",
]);
export function routeHasNativeSearch(route) {
    if (!route?.trim())
        return false;
    return NATIVE_SEARCH_ROUTES.has(route.trim());
}
export function signedInOauthRoutes(home) {
    const doc = readAuthDocument(home);
    const credentials = asRecord(doc?.credentials);
    if (!credentials)
        return [];
    return OSS_OAUTH_PROVIDERS.filter((row) => {
        const cred = asRecord(credentials[row.id]);
        return cred ? credentialUsable(cred) : false;
    });
}
//# sourceMappingURL=oauth-login.js.map