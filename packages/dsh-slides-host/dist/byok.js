import fs from "node:fs";
import path from "node:path";
import { isAntigravityId } from "./local-models.js";
export const BYOK_FILENAME = "slides-byok.json";
export const BYOK_PRESETS = [
    {
        id: "openai",
        name: "OpenAI",
        apiKeyEnv: "OPENAI_API_KEY",
        baseURL: "https://api.openai.com/v1",
        api: "openai-completions",
        models: ["gpt-4o", "gpt-4.1"],
    },
    {
        id: "deepseek",
        name: "DeepSeek",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        baseURL: "https://api.deepseek.com/v1",
        api: "openai-completions",
        models: ["deepseek-chat"],
    },
    {
        id: "moonshot",
        name: "Moonshot / Kimi",
        apiKeyEnv: "MOONSHOT_API_KEY",
        baseURL: "https://api.moonshot.cn/v1",
        api: "openai-completions",
        models: ["kimi-k2.5"],
    },
    {
        id: "zhipu",
        name: "智谱 GLM",
        apiKeyEnv: "ZHIPU_API_KEY",
        baseURL: "https://open.bigmodel.cn/api/paas/v4",
        api: "openai-completions",
        models: ["glm-4.5", "glm-4.6"],
    },
];
const ID_RE = /^[a-z][a-z0-9-]{1,40}$/;
/**
 * A BYOK provider's apiKeyEnv names the process.env slot the stored key is
 * bound into. Without an allowlist a user-controlled file could redirect the
 * key write into NODE_OPTIONS/DYLD_* and friends — code execution, not config.
 * Require a conventional *_API_KEY/_KEY name and deny reserved prefixes.
 */
const API_KEY_ENV_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
const RESERVED_ENV_PREFIXES = [
    "NODE_",
    "DSH_",
    "SLIDESTUDIO_",
    "NPM_",
    "BASH_",
    "LD_",
    "DYLD_",
    "PYTHON",
    "GIT_",
];
export function isAllowedApiKeyEnv(name) {
    if (!API_KEY_ENV_RE.test(name))
        return false;
    if (!name.endsWith("_API_KEY") && !name.endsWith("_KEY"))
        return false;
    return !RESERVED_ENV_PREFIXES.some((prefix) => name.startsWith(prefix));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function byokFile(home) {
    return path.join(home, BYOK_FILENAME);
}
function parseProvider(value) {
    if (!isRecord(value))
        return undefined;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const apiKeyEnv = typeof value.apiKeyEnv === "string" ? value.apiKeyEnv.trim() : "";
    const baseURL = typeof value.baseURL === "string" ? value.baseURL.trim() : "";
    const api = typeof value.api === "string" ? value.api.trim() : "openai-completions";
    if (!ID_RE.test(id) || isAntigravityId(id) || !name || !isAllowedApiKeyEnv(apiKeyEnv) || !baseURL)
        return undefined;
    const models = Array.isArray(value.models)
        ? value.models.filter((row) => typeof row === "string" && row.trim().length > 0)
            .map((row) => row.trim())
        : [];
    return {
        id,
        name,
        apiKeyEnv,
        baseURL,
        api: api || "openai-completions",
        models: models.length > 0 ? models : ["default"],
        userAdded: true,
    };
}
export function readByokProviders(home) {
    const file = byokFile(home);
    if (!fs.existsSync(file))
        return [];
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        const list = isRecord(parsed) && Array.isArray(parsed.providers) ? parsed.providers : [];
        const out = [];
        for (const row of list) {
            const provider = parseProvider(row);
            if (provider && !out.some((item) => item.id === provider.id))
                out.push(provider);
        }
        return out;
    }
    catch {
        return [];
    }
}
function writeByokProviders(home, providers) {
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    const file = byokFile(home);
    fs.writeFileSync(file, `${JSON.stringify({ providers }, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(file, 0o600);
}
export function parseByokUpsert(value) {
    const presetId = isRecord(value) && typeof value.preset === "string" ? value.preset.trim() : "";
    const preset = BYOK_PRESETS.find((row) => row.id === presetId);
    const merged = {
        ...(preset ?? {}),
        ...(isRecord(value) ? value : {}),
        id: isRecord(value) && typeof value.id === "string" ? value.id : preset?.id,
        name: isRecord(value) && typeof value.name === "string" ? value.name : preset?.name,
        apiKeyEnv: isRecord(value) && typeof value.apiKeyEnv === "string" ? value.apiKeyEnv : preset?.apiKeyEnv,
        baseURL: isRecord(value) && typeof value.baseURL === "string" ? value.baseURL : preset?.baseURL,
        api: isRecord(value) && typeof value.api === "string" ? value.api : preset?.api,
        models: isRecord(value) && Array.isArray(value.models) ? value.models : preset?.models,
    };
    const provider = parseProvider({ ...merged, userAdded: true });
    if (!provider)
        throw new Error("invalid BYOK provider");
    let parsedUrl;
    try {
        parsedUrl = new URL(provider.baseURL);
    }
    catch {
        throw new Error("baseURL must be an http(s) URL");
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("baseURL must be an http(s) URL");
    }
    return provider;
}
export function upsertByokProvider(home, provider) {
    const current = [...readByokProviders(home)];
    const index = current.findIndex((row) => row.id === provider.id);
    if (index >= 0)
        current[index] = provider;
    else
        current.push(provider);
    writeByokProviders(home, current);
    return current;
}
export function removeByokProvider(home, providerId) {
    const current = readByokProviders(home);
    const next = current.filter((row) => row.id !== providerId);
    if (next.length === current.length)
        return false;
    writeByokProviders(home, next);
    return true;
}
//# sourceMappingURL=byok.js.map