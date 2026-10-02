import { LlmError, ReasoningEffortId, RetryPolicySchema, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { createModels, defaultProviderAuthContext, getCurrentTools, normalizeContext } from "@earendil-works/pi-ai";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { AsyncLocalStorage } from "node:async_hooks";
import { basename, dirname, join, resolve } from "node:path";
import { connect, isIP } from "node:net";
import { Agent, EnvHttpProxyAgent, ProxyAgent, getGlobalDispatcher, install, setGlobalDispatcher } from "undici";
import { closeOpenAICodexWebSocketSessions } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";
//#region src/catalog.ts
const PI_LOGIN_PROVIDERS = [
	{
		id: "openai-codex",
		route: "pi-openai-codex",
		authType: "oauth",
		displayName: "ChatGPT Codex",
		shortName: "Codex",
		blurb: "ChatGPT Plus/Pro Codex. Independent of official `codex login`.",
		blurbZh: "ChatGPT Plus/Pro 的 Codex。和官方 `codex login` 互不影响。",
		allowedHosts: [
			"auth.openai.com",
			"chatgpt.com",
			"www.chatgpt.com"
		],
		allowedSuffixes: [".openai.com", ".chatgpt.com"],
		preferredModels: [
			"gpt-5.4",
			"gpt-5.3-codex",
			"gpt-5.3-codex-spark"
		]
	},
	{
		id: "anthropic",
		route: "pi-anthropic",
		authType: "oauth",
		displayName: "Claude Pro/Max",
		shortName: "Claude",
		blurb: "Claude subscription. Independent of official Claude Code login.",
		blurbZh: "Claude 订阅。和官方 Claude Code 登录互不影响。",
		allowedHosts: [
			"claude.ai",
			"www.claude.ai",
			"platform.claude.com"
		],
		allowedSuffixes: [".anthropic.com", ".claude.ai"],
		preferredModels: [
			"claude-opus-4-6",
			"claude-sonnet-4-6",
			"claude-opus-4-5"
		]
	},
	{
		id: "xai",
		route: "pi-xai",
		authType: "oauth",
		displayName: "xAI Grok",
		shortName: "Grok",
		blurb: "SuperGrok / X Premium. Independent of official `grok` CLI.",
		blurbZh: "SuperGrok / X Premium。和官方 `grok` CLI 互不影响。",
		allowedHosts: [
			"auth.x.ai",
			"accounts.x.ai",
			"x.ai",
			"www.x.ai"
		],
		allowedSuffixes: [".x.ai"],
		preferredModels: [
			"grok-4.6",
			"grok-4.5",
			"grok-4.3"
		]
	},
	{
		id: "github-copilot",
		route: "pi-github-copilot",
		authType: "oauth",
		displayName: "GitHub Copilot",
		shortName: "Copilot",
		blurb: "GitHub Copilot subscription via device code.",
		blurbZh: "GitHub Copilot 订阅，走 device code。",
		allowedHosts: [
			"github.com",
			"www.github.com",
			"api.github.com"
		],
		allowedSuffixes: [".github.com", ".githubcopilot.com"],
		preferredModels: [
			"gpt-5.4",
			"claude-sonnet-4.6",
			"claude-opus-4.6"
		]
	},
	{
		id: "openrouter",
		route: "pi-openrouter",
		authType: "oauth",
		displayName: "OpenRouter",
		shortName: "OpenRouter",
		blurb: "OpenRouter OAuth mints a key billed from your OpenRouter credits.",
		blurbZh: "OpenRouter OAuth 会签发一把钥匙，从你的 OpenRouter 余额扣费。",
		allowedHosts: ["openrouter.ai", "www.openrouter.ai"],
		allowedSuffixes: [".openrouter.ai"],
		preferredModels: []
	},
	{
		id: "kimi-coding",
		route: "pi-kimi-coding",
		authType: "oauth",
		displayName: "Kimi For Coding",
		shortName: "Kimi",
		blurb: "Kimi Code subscription.",
		blurbZh: "Kimi Code 订阅。",
		allowedHosts: [
			"auth.kimi.com",
			"kimi.com",
			"www.kimi.com",
			"api.kimi.com"
		],
		allowedSuffixes: [".kimi.com"],
		preferredModels: ["kimi-for-coding", "k3"]
	},
	{
		id: "zai-coding-cn",
		route: "pi-zai-coding-cn",
		authType: "api_key",
		loginUrl: "https://bigmodel.cn/coding-plan/personal/overview",
		displayName: "智谱 GLM Coding Plan",
		shortName: "GLM",
		blurb: "Zhipu GLM Coding Plan (China) via its official Plan API key.",
		blurbZh: "智谱 GLM Coding Plan 中国区套餐，使用套餐页签发的专用 API Key。",
		allowedHosts: [
			"bigmodel.cn",
			"www.bigmodel.cn",
			"open.bigmodel.cn"
		],
		allowedSuffixes: [".bigmodel.cn"],
		preferredModels: [
			"glm-5.3-flash",
			"glm-5.3",
			"glm-5.2",
			"glm-5-turbo",
			"glm-5.1",
			"glm-4.7"
		]
	}
];
function piLoginProvider(id) {
	return PI_LOGIN_PROVIDERS.find((provider) => provider.id === id);
}
function piLoginProviderByRoute(route) {
	return PI_LOGIN_PROVIDERS.find((provider) => provider.route === route);
}
function requirePiLoginProvider(id) {
	const provider = piLoginProvider(id);
	if (provider === void 0) throw new Error(`dsh-oauth-login: unknown provider "${id}"`);
	return provider;
}
function piLoginRoutes() {
	return PI_LOGIN_PROVIDERS.map((provider) => provider.route);
}
//#endregion
//#region src/extra-models.ts
/**
* https://developers.openai.com/api/docs/models/gpt-6-astra
* Use the Codex catalog's default 272K context, not the API's larger ceiling.
* Ultra is an app orchestration mode, not a Pi reasoning effort.
*/
const OPENAI_CODEX_EXTRA_MODELS = [{
	id: "gpt-6-astra",
	name: "GPT-6 Astra",
	api: "openai-codex-responses",
	provider: "openai-codex",
	baseUrl: "https://chatgpt.com/backend-api",
	reasoning: true,
	input: ["text", "image"],
	cost: {
		input: 10,
		output: 50,
		cacheRead: 1,
		cacheWrite: 12.5
	},
	contextWindow: 272e3,
	maxTokens: 128e3,
	thinkingLevelMap: {
		off: null,
		minimal: null,
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: "xhigh",
		max: "max"
	}
}];
/** Newer xAI Grok models missing from the installed pi-ai catalog (0.82.x). */
const XAI_EXTRA_MODELS = [{
	id: "grok-4.6",
	name: "Grok 4.6",
	api: "openai-responses",
	provider: "xai",
	baseUrl: "https://api.x.ai/v1",
	reasoning: true,
	input: ["text", "image"],
	cost: {
		input: 2,
		output: 6,
		cacheRead: .3,
		cacheWrite: 0
	},
	contextWindow: 5e5,
	maxTokens: 5e5,
	compat: { supportsLongCacheRetention: false },
	thinkingLevelMap: {
		off: null,
		minimal: null,
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: "xhigh",
		max: null
	}
}];
/**
* Official GLM-5.3 family metadata. Standard is text-only; Flash also accepts
* images. Keep separate IDs so choosing standard never routes to Flash.
* https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3
* https://docs.bigmodel.cn/cn/coding-plan/latest-model
*/
const ZAI_CODING_CN_EXTRA_MODELS = [{
	id: "glm-5.3-flash",
	name: "GLM-5.3-Flash",
	api: "openai-completions",
	provider: "zai-coding-cn",
	baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
	reasoning: true,
	input: ["text", "image"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0
	},
	contextWindow: 1e6,
	maxTokens: 131072,
	compat: {
		supportsStore: false,
		supportsDeveloperRole: false,
		supportsReasoningEffort: true,
		thinkingFormat: "zai",
		zaiToolStream: true
	},
	thinkingLevelMap: {
		off: null,
		minimal: null,
		low: "low",
		medium: null,
		high: "high",
		xhigh: null,
		max: "max"
	}
}, {
	id: "glm-5.3",
	name: "GLM-5.3",
	api: "openai-completions",
	provider: "zai-coding-cn",
	baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
	reasoning: true,
	input: ["text"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0
	},
	contextWindow: 1e6,
	maxTokens: 131072,
	compat: {
		supportsStore: false,
		supportsDeveloperRole: false,
		supportsReasoningEffort: true,
		thinkingFormat: "zai",
		zaiToolStream: true
	},
	thinkingLevelMap: {
		off: null,
		minimal: null,
		low: "low",
		medium: null,
		high: "high",
		xhigh: null,
		max: "max"
	}
}];
/** OpenRouter stealth model missing from the installed pi-ai catalog (0.82.x–0.84.x). */
const OX_ALPHA_MODEL_ID = "stealth/ox-alpha";
/**
* OpenRouter's live default for ox-alpha (`reasoning.default_effort`).
* Must be sent explicitly: pi-ai's OpenRouter dialect writes
* `reasoning: { effort: thinkingLevelMap.off ?? "none" }` when the caller
* omits an effort, and ox-alpha rejects `none` (`reasoning.mandatory: true`).
*/
const OX_ALPHA_DEFAULT_EFFORT = "max";
/**
* OpenRouter stealth models missing from the installed pi-ai catalog (0.82.x).
* Capacities follow the public OpenRouter listing: 1M context, text+image, free.
* Effort levels follow live `/api/v1/models` (`supported_efforts`, `default_effort`).
*/
const OPENROUTER_EXTRA_MODELS = [{
	id: OX_ALPHA_MODEL_ID,
	name: "OX Alpha",
	api: "openai-completions",
	provider: "openrouter",
	baseUrl: "https://openrouter.ai/api/v1",
	reasoning: true,
	input: ["text", "image"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0
	},
	contextWindow: 1e6,
	maxTokens: 131072,
	compat: {
		supportsDeveloperRole: false,
		thinkingFormat: "openrouter"
	},
	thinkingLevelMap: {
		off: null,
		minimal: null,
		low: "low",
		medium: null,
		high: "high",
		xhigh: null,
		max: "max"
	}
}];
/** Per-model default the selector and request path should apply when omitted. */
function defaultReasoningEffortFor(modelId) {
	if (modelId === "gpt-6-astra") return "medium";
	if (modelId === "stealth/ox-alpha") return "max";
	if (modelId === "glm-5.3") return "max";
	if (modelId === "glm-5.3-flash") return "max";
}
const EXTRA_MODELS_BY_PROVIDER = {
	"openai-codex": OPENAI_CODEX_EXTRA_MODELS,
	xai: XAI_EXTRA_MODELS,
	openrouter: OPENROUTER_EXTRA_MODELS,
	"zai-coding-cn": ZAI_CODING_CN_EXTRA_MODELS
};
/**
* Extra models this plugin publishes for one pi-ai provider id.
* @param providerId - catalog provider id (e.g. `xai`), not the harness route.
*/
function extraModelsFor(providerId) {
	return EXTRA_MODELS_BY_PROVIDER[providerId] ?? [];
}
//#endregion
//#region src/hosted-capture.ts
/** Per-request bag for hosted Responses output that pi-ai drops. */
const hostedCapture = new AsyncLocalStorage();
function currentHostedCapture() {
	return hostedCapture.getStore();
}
/** Keep ALS alive across each iterator step so the OpenAI SDK fetch inherits it. */
function iterateInCapture(capture, source) {
	return { [Symbol.asyncIterator]() {
		const iterator = source[Symbol.asyncIterator]();
		return {
			next: () => hostedCapture.run(capture, () => iterator.next()),
			return: (value) => hostedCapture.run(capture, () => iterator.return?.(value) ?? Promise.resolve({
				done: true,
				value: void 0
			})),
			throw: (error) => hostedCapture.run(capture, () => iterator.throw?.(error) ?? Promise.reject(error))
		};
	} };
}
//#endregion
//#region src/hosted-images.ts
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sniffImageMediaType(bytes) {
	if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
	if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image/png";
	if (bytes.length >= 6 && bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) return "image/gif";
	if (bytes.length >= 12 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
}
function stripDataUrl(value) {
	return /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s.exec(value.trim())?.[1] ?? value.trim();
}
function base64FromUnknown(value) {
	if (typeof value === "string" && value.length > 0) return stripDataUrl(value);
	if (!isRecord$1(value)) return void 0;
	if (typeof value.b64_json === "string" && value.b64_json.length > 0) return stripDataUrl(value.b64_json);
	if (typeof value.base64 === "string" && value.base64.length > 0) return stripDataUrl(value.base64);
	if (typeof value.result === "string" && value.result.length > 0) return stripDataUrl(value.result);
}
function pushImage(into, id, base64) {
	if (id !== void 0 && into.some((existing) => existing.id === id)) return;
	if (id === void 0 && into.some((existing) => existing.base64 === base64)) return;
	into.push(id === void 0 ? { base64 } : {
		id,
		base64
	});
}
function collectHostedImageFromItem(item, into) {
	if (!isRecord$1(item) || item.type !== "image_generation_call") return;
	if (item.status !== void 0 && item.status !== "completed") return;
	const base64 = base64FromUnknown(item.result);
	if (base64 === void 0) return;
	pushImage(into, typeof item.id === "string" ? item.id : void 0, base64);
}
function collectHostedImagesFromEvent(event, into) {
	if (!isRecord$1(event) || typeof event.type !== "string") return;
	if (event.type === "response.output_item.done") {
		collectHostedImageFromItem(event.item, into);
		return;
	}
	if (event.type.startsWith("response.image_generation_call.")) {
		collectHostedImageFromItem(event.item, into);
		if (event.type.endsWith(".completed")) {
			const base64 = base64FromUnknown(event.result);
			if (base64 !== void 0) pushImage(into, typeof event.item_id === "string" ? event.item_id : isRecord$1(event.item) && typeof event.item.id === "string" ? event.item.id : void 0, base64);
		}
		return;
	}
	if (event.type !== "response.completed" && event.type !== "response.incomplete") return;
	const output = isRecord$1(event.response) ? event.response.output : void 0;
	if (!Array.isArray(output)) return;
	for (const item of output) collectHostedImageFromItem(item, into);
}
function decodeHostedImage(base64) {
	let data;
	try {
		data = Uint8Array.from(Buffer.from(base64, "base64"));
	} catch {
		return;
	}
	if (data.length === 0) return void 0;
	const mediaType = sniffImageMediaType(data);
	return mediaType === void 0 ? void 0 : {
		data,
		mediaType
	};
}
function extensionFor(mediaType) {
	switch (mediaType) {
		case "image/jpeg": return "jpg";
		case "image/png": return "png";
		case "image/webp": return "webp";
		case "image/gif": return "gif";
	}
}
/**
* pi-ai replay cannot represent assistant ImageBlocks. Drop them before the
* next request so replay metadata still lines up with remaining content.
*/
function stripAssistantImages(messages) {
	return messages.map((message) => {
		if (message.role !== "assistant") return message;
		const content = message.content.filter((block) => block.type !== "image");
		return content.length === message.content.length ? message : {
			...message,
			content
		};
	});
}
async function* injectHostedImages(source, capture, save) {
	let maxIndex = -1;
	const tail = [];
	for await (const chunk of source) {
		if ("index" in chunk && typeof chunk.index === "number") maxIndex = Math.max(maxIndex, chunk.index);
		if (chunk.type === "usage" || chunk.type === "finish") {
			tail.push(chunk);
			continue;
		}
		yield chunk;
	}
	for (const image of capture.images) {
		const decoded = decodeHostedImage(image.base64);
		if (decoded === void 0) continue;
		try {
			const attachment = await save({
				data: decoded.data,
				mediaType: decoded.mediaType,
				name: `generated.${extensionFor(decoded.mediaType)}`
			});
			const index = maxIndex + 1;
			maxIndex = index;
			yield {
				type: "block-start",
				index,
				blockType: "image"
			};
			yield {
				type: "block-end",
				index,
				block: {
					type: "image",
					attachment
				}
			};
		} catch {}
	}
	yield* tail;
}
//#endregion
//#region src/ids.ts
/** Basename of the DSH-owned multi-provider OAuth document. */
const PI_LOGIN_AUTH_FILENAME = ".dsh-oauth-auth.json";
/** Legacy DSH filename accepted during the one-time storage migration. */
const LEGACY_PI_LOGIN_AUTH_FILENAME = ".pi-login-auth.json";
/** Prefix for harness routes so they never collide with catalog / other plugins. */
const PI_LOGIN_ROUTE_PREFIX = "pi-";
/** Provider idle ceiling used by every composite route. */
const PI_LOGIN_STREAM_IDLE_TIMEOUT_MS = 3e5;
/** RC8 request-level image payload ceiling; matches the official pi-ai default. */
const PI_LOGIN_MAX_REQUEST_IMAGE_BYTES = 20971520;
/** Startup line `dshx verify` looks for. */
const PI_LOGIN_BOOT_MARKER = "[my-plugins/dsh-oauth-login] loaded";
//#endregion
//#region src/model-error-hint.ts
/** Provider-specific failure compatibility and user-facing model error copy. */
/**
* Default Harness `retryPolicy` codes. Keep aligned with
* `resolveRetryPolicy(undefined)` in `@deepseek-ai/dsh-llm`.
*/
const TRANSIENT_MODEL_CODES = Object.freeze([
	"EMPTY_RESPONSE",
	"RATE_LIMIT",
	"SERVER",
	"TIMEOUT",
	"TRANSPORT"
]);
const QUOTA_HINT = "This is account quota or credits, not a temporary busy signal. Automatic retry will not refill it. Check the plan, usage window, or balance.";
const RATE_LIMIT_HINT = "This is a request-rate or peak-busy limit. A 429 is often this, not an empty balance. After automatic retries end, wait and send another message. If Continue fails or the composer stays stuck, start a new chat.";
const TRANSIENT_HINT = "After this turn ends, send another message to try again. If Continue fails or the composer stays stuck, start a new chat.";
const SENTINELS = [
	"Automatic retry will not refill it",
	"request-rate or peak-busy limit",
	"After this turn ends, send another message"
];
/** Stable Chat copy for one official `LlmError` code. Does not invent 5h vs weekly vs billing. */
function hintForCode(code) {
	if (code === "QUOTA") return QUOTA_HINT;
	if (code === "RATE_LIMIT") return RATE_LIMIT_HINT;
	if (TRANSIENT_MODEL_CODES.includes(code)) return TRANSIENT_HINT;
}
function alreadyHinted(message) {
	return SENTINELS.some((marker) => message.includes(marker));
}
/** Read only the top-level Zhipu error code, never incidental request or message text. */
function isZhipuPlanQuota(message) {
	const match = /^\s*429\s*:\s*(\{[\s\S]*\})\s*$/.exec(message);
	if (match === null) return false;
	let payload;
	try {
		payload = JSON.parse(match[1]);
	} catch (_malformedProviderJson) {
		return false;
	}
	return typeof payload === "object" && payload !== null && !Array.isArray(payload) && "code" in payload && (payload.code === "1310" || payload.code === 1310);
}
/** Repair only observed route-specific classification gaps; keep all other official codes. */
function providerFailure(failure, provider) {
	if (provider === "pi-openai-codex" && failure.code === "PI_AI_ERROR" && (/^WebSocket error$/i.test(failure.message.trim()) || /^WebSocket closed (?:1000|1001|1005|1006|1011|1012|1013)(?:\s|$)/i.test(failure.message.trim()))) return {
		...failure,
		code: "TRANSPORT"
	};
	if (provider === "pi-openai-codex" && failure.code === "PI_AI_ERROR" && /\b(?:servers?|engine)\s+(?:are|is)\s+(?:currently\s+)?overloaded\b/i.test(failure.message)) return {
		...failure,
		code: "SERVER"
	};
	if (provider === "pi-zai-coding-cn" && failure.code === "RATE_LIMIT" && isZhipuPlanQuota(failure.message)) return {
		...failure,
		code: "QUOTA"
	};
	return failure;
}
/** Normalize known provider gaps before the official retry executor receives this failure. */
function hintFailure(failure, provider) {
	const normalized = providerFailure(failure, provider);
	const hint = hintForCode(normalized.code);
	if (hint === void 0 || alreadyHinted(normalized.message)) return normalized;
	return {
		...normalized,
		message: `${normalized.message} ${hint}`
	};
}
/** Apply the same provider correction and hint to thrown failures, preserving diagnostics. */
function withModelErrorHint(error, provider) {
	if (!(error instanceof LlmError)) return error;
	const hinted = hintFailure(error.failure, provider);
	if (hinted === error.failure) return error;
	return new LlmError(hinted.message, hinted.code, {
		cause: error,
		...error.failure.status === void 0 ? {} : { status: error.failure.status },
		...error.failure.providerRetryAfterMs === void 0 ? {} : { providerRetryAfterMs: error.failure.providerRetryAfterMs },
		...error.failure.requestId === void 0 ? {} : { requestId: error.failure.requestId }
	});
}
//#endregion
//#region src/openrouter-models.ts
function objectValue(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function validModelId(value) {
	return typeof value === "string" && /^~?[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/.test(value);
}
function strings(value) {
	return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string" && item.length < 256))] : [];
}
function positiveInteger(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : void 0;
}
/**
* Conservative, all-cost classification. Missing/invalid prices, unknown
* structures and conditional overrides never become a free badge. In
* particular, a tiny positive decimal must not underflow into a free price.
*/
function classifyOpenRouterPricing(value) {
	const source = objectValue(value);
	const pricing = {};
	let unknown = source === void 0 || source.prompt === void 0 || source.completion === void 0;
	let paid = false;
	for (const [key, raw] of Object.entries(source ?? {})) {
		if (key === "overrides") {
			if (!Array.isArray(raw) || raw.length > 0) unknown = true;
			continue;
		}
		if (typeof raw !== "string" || raw.length > 128 || !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw)) {
			unknown = true;
			continue;
		}
		const numeric = Number(raw);
		if (!Number.isFinite(numeric) || numeric < 0) {
			unknown = true;
			continue;
		}
		pricing[key] = raw;
		if (!/^0+(?:\.0+)?(?:e[+-]?\d+)?$/i.test(raw)) paid = true;
	}
	return {
		pricing,
		priceStatus: paid ? "paid" : unknown ? "unknown" : "free"
	};
}
function normalizeOpenRouterModels(raw) {
	if (!Array.isArray(raw) || raw.length === 0 || raw.length > 1e4) throw new Error("OpenRouter returned an empty or invalid model catalog");
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const entry of raw) {
		const row = objectValue(entry);
		if (row === void 0 || !validModelId(row.id)) throw new Error("Invalid OpenRouter model ID");
		if (row.id.endsWith(":batch")) continue;
		const architecture = objectValue(row.architecture);
		const inputModalities = strings(architecture?.input_modalities);
		const outputModalities = strings(architecture?.output_modalities);
		if (!inputModalities.includes("text") || !outputModalities.includes("text")) continue;
		if (seen.has(row.id)) throw new Error("Duplicate OpenRouter model ID");
		const top = objectValue(row.top_provider);
		const contextWindow = positiveInteger(row.context_length) ?? positiveInteger(top?.context_length);
		if (contextWindow === void 0) throw new Error("Invalid OpenRouter context limit");
		const supportedParameters = strings(row.supported_parameters);
		const reason = objectValue(row.reasoning);
		const reasoning = supportedParameters.some((key) => key === "reasoning" || key === "include_reasoning");
		const supportedEfforts = strings(reason?.supported_efforts);
		const defaultEffort = typeof reason?.default_effort === "string" ? reason.default_effort : void 0;
		const maxTokens = Math.min(contextWindow, positiveInteger(top?.max_completion_tokens) ?? Math.min(contextWindow, 8192));
		out.push({
			id: row.id,
			name: typeof row.name === "string" && row.name.trim() !== "" ? row.name.slice(0, 256) : row.id,
			contextWindow,
			maxTokens,
			inputModalities,
			outputModalities,
			supportedParameters,
			tools: supportedParameters.includes("tools"),
			reasoning,
			reasoningMandatory: reasoning && reason?.mandatory === true,
			...supportedEfforts.length === 0 ? {} : { supportedEfforts },
			...defaultEffort === void 0 ? {} : { defaultEffort },
			...classifyOpenRouterPricing(row.pricing),
			...typeof row.expiration_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.expiration_date) ? { deprecatesAt: row.expiration_date } : {}
		});
		seen.add(row.id);
	}
	if (out.length === 0) throw new Error("OpenRouter returned no usable text models");
	return out;
}
const LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
function openRouterThinkingMap(info, base) {
	if (!info.reasoning) return void 0;
	if (info.supportedEfforts === void 0) return {
		...base?.thinkingLevelMap,
		...info.reasoningMandatory ? { off: null } : {}
	};
	const map = {};
	for (const level of LEVELS) {
		const wire = level === "off" ? "none" : level;
		map[level] = info.supportedEfforts.includes(wire) && !(level === "off" && info.reasoningMandatory) ? wire : null;
	}
	return map;
}
function openRouterDefaultEffort(info) {
	if (info?.reasoning !== true) return void 0;
	if (info.defaultEffort !== void 0 && info.defaultEffort !== "none") return info.defaultEffort;
	if (!info.reasoningMandatory) return void 0;
	return info.supportedEfforts?.find((level) => level === "high") ?? info.supportedEfforts?.find((level) => level !== "none") ?? "high";
}
function openRouterPiModel(info, base) {
	const rate = (key) => {
		const value = Number(info.pricing[key] ?? 0) * 1e6;
		return Number.isFinite(value) ? value : 0;
	};
	const thinkingLevelMap = openRouterThinkingMap(info, base);
	return {
		...base,
		id: info.id,
		name: info.name,
		api: "openai-completions",
		provider: "openrouter",
		baseUrl: "https://openrouter.ai/api/v1",
		input: info.inputModalities.includes("image") ? ["text", "image"] : ["text"],
		contextWindow: info.contextWindow,
		maxTokens: info.maxTokens,
		reasoning: info.reasoning,
		...thinkingLevelMap === void 0 ? {} : { thinkingLevelMap },
		cost: {
			input: rate("prompt"),
			output: rate("completion"),
			cacheRead: rate("input_cache_read"),
			cacheWrite: rate("input_cache_write")
		},
		compat: {
			...base?.compat,
			supportsDeveloperRole: false,
			thinkingFormat: "openrouter"
		}
	};
}
//#endregion
//#region src/openrouter-types.ts
/** Browser-safe contract. No credentials, provider URLs or server imports. */
const OPENROUTER_CATALOG_PATH = "/plugins/dsh-oauth-login/openrouter/models";
const OPENROUTER_REFRESH_PATH = "/plugins/dsh-oauth-login/openrouter/models/refresh";
const OPENROUTER_REFRESH_MS = 9e5;
const OPENROUTER_COOLDOWN_MS = 6e4;
//#endregion
//#region src/native-tools.ts
/**
* OAuth routes that already have provider-hosted search / image tools.
* DSH's web_search function tool would hide those and bill a second key.
*/
/** DSH model-facing tools that steal traffic from a subscribed provider. */
const DSH_WEB_TOOL_NAMES = ["web_search", "web_fetch"];
/** Matching tool-web prompt sections. */
const DSH_WEB_SECTION_NAMES = ["tool:web_search", "tool:web_fetch"];
const DSH_WEB_TOOL_NAME_SET = new Set(DSH_WEB_TOOL_NAMES);
const DSH_WEB_SECTION_NAME_SET = new Set(DSH_WEB_SECTION_NAMES);
/** Precise xAI server-side X Search operations published by the provider. */
const XAI_SERVER_X_SEARCH_NAMES = [
	"x_user_search",
	"x_keyword_search",
	"x_semantic_search",
	"x_thread_fetch"
];
const XAI_SERVER_X_SEARCH_NAME_SET = new Set(XAI_SERVER_X_SEARCH_NAMES);
/**
* Hosted / server-executed names that can leak as client function calls
* after this plugin removes DSH's implementations from the route.
*/
const HOSTED_CLIENT_LEAK_NAMES = [
	...XAI_SERVER_X_SEARCH_NAMES,
	"web_search",
	"web_fetch",
	"image_generation",
	"imagine_text_to_image",
	"imagine_image_to_image",
	"imagine_image_edit"
];
const HOSTED_CLIENT_LEAK_NAME_SET = new Set(HOSTED_CLIENT_LEAK_NAMES);
const DEFAULT_NATIVE_TOOL_POLICY = {
	enabled: true,
	image: true
};
const SEARCH_GUIDANCE = "This turn already includes this account's native hosted search. Do not call web_search or web_fetch — those DSH tools are not available on this route.";
const SEARCH_AND_IMAGE_GUIDANCE = "This turn already includes this account's native hosted search and image generation. Do not call web_search or web_fetch — those DSH tools are not available on this route.";
function responsesSearch() {
	return { type: "web_search" };
}
function responsesXSearch() {
	return { type: "x_search" };
}
function responsesImage() {
	return { type: "image_generation" };
}
function anthropicSearch() {
	return {
		type: "web_search_20250305",
		name: "web_search"
	};
}
function nativePlan(providerId, api, policy = DEFAULT_NATIVE_TOOL_POLICY) {
	if (!policy.enabled) return void 0;
	switch (`${providerId}:${api ?? ""}`) {
		case "xai:openai-responses": return {
			providerId,
			api: "openai-responses",
			hosted: [
				responsesSearch(),
				responsesXSearch(),
				...policy.image ? [responsesImage()] : []
			],
			guidance: policy.image ? SEARCH_AND_IMAGE_GUIDANCE : SEARCH_GUIDANCE
		};
		case "openai-codex:openai-codex-responses": return {
			providerId,
			api: "openai-codex-responses",
			hosted: [responsesSearch(), ...policy.image ? [responsesImage()] : []],
			guidance: policy.image ? SEARCH_AND_IMAGE_GUIDANCE : SEARCH_GUIDANCE
		};
		case "anthropic:anthropic-messages": return {
			providerId,
			api: "anthropic-messages",
			hosted: [anthropicSearch()],
			guidance: SEARCH_GUIDANCE
		};
		default: return;
	}
}
function nativePlanForRoute(route, api, policy = DEFAULT_NATIVE_TOOL_POLICY) {
	if (route === void 0) return void 0;
	const spec = piLoginProviderByRoute(route);
	return spec === void 0 ? void 0 : nativePlan(spec.id, api, policy);
}
function isDshWebToolName(name) {
	return DSH_WEB_TOOL_NAME_SET.has(name);
}
function isDshWebSectionName(name) {
	return DSH_WEB_SECTION_NAME_SET.has(name);
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* xAI's Responses stream currently exposes server-executed X Search details
* as custom tool calls. The outer `xs_call-*` id distinguishes those traces
* from a same-named client function, which Harness must still execute.
*/
function isXaiServerXSearchCall(block) {
	if (!isRecord(block) || block.type !== "tool-call") return false;
	if (typeof block.name !== "string" || !XAI_SERVER_X_SEARCH_NAME_SET.has(block.name)) return false;
	if (typeof block.id !== "string") return false;
	const outerId = block.id.split("|", 1)[0] ?? "";
	return /^xs_call[-_]/.test(outerId);
}
/**
* Server-executed hosted search / image traces that Harness must not try to run.
* X Search leaks use `xs_call-*`. DSH `web_search` / `web_fetch` were stripped
* from this route, so a leftover same-named call is also a leak.
*/
function isHostedServerToolCall(block) {
	if (!isRecord(block) || block.type !== "tool-call") return false;
	if (typeof block.name !== "string" || !HOSTED_CLIENT_LEAK_NAME_SET.has(block.name)) return false;
	if (isXaiServerXSearchCall(block)) return true;
	if (block.name === "web_search" || block.name === "web_fetch") return true;
	return block.name === "image_generation" || block.name.startsWith("imagine_");
}
/**
* xAI hosted search hops arrive as empty `reasoning` blocks whose signature
* id is `tco_<response>_call-…`. The UI renders each as a blank Think card.
*/
function isHostedSearchReasoningReplay(block) {
	if (!isRecord(block) || block.type !== "reasoning") return false;
	const signature = block.thinkingSignature;
	if (typeof signature !== "string" || signature.length === 0) return false;
	try {
		const parsed = JSON.parse(signature);
		return typeof parsed.id === "string" && parsed.id.startsWith("tco_");
	} catch {
		return signature.includes("\"id\":\"tco_") || signature.startsWith("tco_");
	}
}
function filterPiReplayState(replayState, dropped, forceStop) {
	if (replayState === void 0 || !isRecord(replayState.response) || replayState.response.kind !== "pi-ai" || !Array.isArray(replayState.blocks)) return replayState;
	let seenText = false;
	return {
		...replayState,
		blocks: replayState.blocks.filter((block, index) => {
			if (dropped.has(index) || isHostedSearchReasoningReplay(block)) return false;
			if (isRecord(block) && block.type === "text") {
				seenText = true;
				return true;
			}
			if (seenText && isRecord(block) && block.type === "reasoning") return false;
			return true;
		}),
		response: {
			...replayState.response,
			...forceStop ? { stopReason: "stop" } : {}
		}
	};
}
function isEmptyReasoningText(text) {
	return text.trim().length === 0;
}
/**
* Remove hosted server-side search / image traces after pi-ai 0.82.1 has
* mistaken them for client function calls. Other blocks retain stream order,
* actual client tools survive, and pi-ai replay metadata stays index-aligned.
*/
async function* filterHostedServerToolTraces(source) {
	const dropped = /* @__PURE__ */ new Set();
	const pending = /* @__PURE__ */ new Set();
	const reasoning = /* @__PURE__ */ new Map();
	let buffered = [];
	let keptToolCalls = 0;
	let textStarted = false;
	const flush = function* () {
		for (const item of buffered) {
			if ("index" in item && dropped.has(item.index)) continue;
			yield item;
		}
		buffered = [];
	};
	const closeReasoning = function* (index, end) {
		const held = reasoning.get(index);
		if (held === void 0) {
			if (end !== void 0) yield end;
			return;
		}
		reasoning.delete(index);
		const ended = end?.type === "block-end" && end.block.type === "reasoning" ? end.block.text : "";
		const text = ended.length > 0 ? ended : held.text;
		if (held.afterText || isEmptyReasoningText(text)) return;
		yield* held.chunks;
		if (end !== void 0) yield end;
	};
	for await (const chunk of source) {
		if (chunk.type === "block-start" && chunk.blockType === "text" || chunk.type === "text-delta") textStarted = true;
		if (chunk.type === "block-start" && chunk.blockType === "reasoning") {
			reasoning.set(chunk.index, {
				chunks: [chunk],
				text: "",
				afterText: textStarted
			});
			continue;
		}
		if (chunk.type === "reasoning-delta" && reasoning.has(chunk.index)) {
			const held = reasoning.get(chunk.index);
			if (held !== void 0) {
				held.chunks.push(chunk);
				held.text += chunk.text;
			}
			continue;
		}
		if (chunk.type === "block-end" && chunk.block.type === "reasoning") {
			yield* closeReasoning(chunk.index, chunk);
			continue;
		}
		if (chunk.type === "block-start" && chunk.blockType === "tool-call") {
			pending.add(chunk.index);
			buffered.push(chunk);
			continue;
		}
		if (pending.size > 0) {
			buffered.push(chunk);
			if (chunk.type === "block-end" && chunk.block.type === "tool-call" && pending.has(chunk.index)) {
				if (isHostedServerToolCall(chunk.block)) dropped.add(chunk.index);
				else keptToolCalls += 1;
				pending.delete(chunk.index);
				if (pending.size === 0) yield* flush();
			}
			continue;
		}
		if (chunk.type === "finish") {
			for (const index of [...reasoning.keys()]) yield* closeReasoning(index);
			const forceStop = chunk.reason.kind === "tool-calls" && dropped.size > 0 && keptToolCalls === 0;
			const replayState = filterPiReplayState(chunk.replayState, dropped, forceStop);
			yield {
				type: "finish",
				reason: forceStop ? { kind: "stop" } : chunk.reason,
				...replayState === void 0 ? {} : { replayState }
			};
			continue;
		}
		yield chunk;
	}
	for (const index of [...reasoning.keys()]) yield* closeReasoning(index);
	if (buffered.length > 0) yield* flush();
}
/** @deprecated Use {@link filterHostedServerToolTraces}. */
const filterXaiServerToolTraces = filterHostedServerToolTraces;
/** A function-calling tool DSH registered as web_search / web_fetch. */
function isDshWebFunctionTool(tool) {
	if (!isRecord(tool)) return false;
	const name = typeof tool.name === "string" ? tool.name : void 0;
	if (name === void 0 || !isDshWebToolName(name)) return false;
	const type = tool.type;
	return type === void 0 || type === "function";
}
function hostedToolKey(tool) {
	return `${typeof tool.type === "string" ? tool.type : "function"}:${typeof tool.name === "string" ? tool.name : ""}`;
}
function applyNativeToolsToPayload(payload, providerId, api, policy = DEFAULT_NATIVE_TOOL_POLICY) {
	const plan = nativePlan(providerId, api, policy);
	if (plan === void 0 || !isRecord(payload) || !Array.isArray(payload.tools)) return payload;
	const kept = payload.tools.filter((tool) => !isDshWebFunctionTool(tool));
	const seen = new Set(kept.filter(isRecord).map((tool) => hostedToolKey(tool)));
	const hosted = plan.hosted.filter((tool) => {
		const key = hostedToolKey(tool);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	return {
		...payload,
		tools: [...hosted, ...kept]
	};
}
function wrapOnPayload(existing, providerId, api, policy = DEFAULT_NATIVE_TOOL_POLICY) {
	if (nativePlan(providerId, api, policy) === void 0) return existing;
	return async (payload, model) => {
		const injected = applyNativeToolsToPayload(isRecord(payload) && !("tools" in payload) ? {
			...payload,
			tools: []
		} : payload, providerId, api, policy);
		if (existing === void 0) return injected;
		return await existing(injected, model);
	};
}
function filterPiContext(context, providerId, api, policy = DEFAULT_NATIVE_TOOL_POLICY) {
	if (nativePlan(providerId, api, policy) === void 0) return context;
	return {
		...context,
		...context.tools === void 0 ? {} : { tools: context.tools.filter((tool) => !isDshWebToolName(tool.name)) },
		messages: context.messages.map((message) => message.role !== "system" ? message : {
			...message,
			...message.toolsAdded === void 0 ? {} : { toolsAdded: message.toolsAdded.filter((tool) => !isDshWebToolName(tool.name)) },
			...message.toolsRemoved === void 0 ? {} : { toolsRemoved: message.toolsRemoved.filter((tool) => !isDshWebToolName(tool.name)) }
		})
	};
}
/**
* Prepare one provider request as a single unit.
*
* Native tools are a property of this request, not of the provider account.
* A context without tools is a text-only call (reviewers, summaries, titles,
* and similar utility traffic), so its payload hook must stay untouched even
* when the provider serializer later emits `tools: []`.
*/
function prepareNativeToolRequest(context, options, providerId, api, policy = DEFAULT_NATIVE_TOOL_POLICY) {
	if (context.tools === void 0 && getCurrentTools(context.messages).length === 0 || nativePlan(providerId, api, policy) === void 0) return {
		context,
		options
	};
	const onPayload = wrapOnPayload(options?.onPayload, providerId, api, policy);
	return {
		context: filterPiContext(context, providerId, api, policy),
		options: onPayload === options.onPayload ? options : Object.assign({}, options, { onPayload })
	};
}
function maskDshWebAssembly(assembly, plan) {
	return {
		...assembly,
		tools: assembly.tools.filter((tool) => !isDshWebToolName(tool.name)),
		sections: [...assembly.sections.filter((section) => !isDshWebSectionName(section.name)), {
			name: "oauth:native-tools",
			text: plan.guidance
		}]
	};
}
//#endregion
//#region src/adapter.ts
/** One PiAiAdapter covering every Pi-login harness route. */
/** Keep provider failures routable for both direct and snapshot-prepared requests. */
async function* withFailureHints(source, provider) {
	try {
		for await (const chunk of source) if (chunk.type === "finish" && chunk.reason.kind === "error") yield {
			...chunk,
			reason: {
				...chunk.reason,
				failure: hintFailure(chunk.reason.failure, provider)
			}
		};
		else yield chunk;
	} catch (error) {
		throw withModelErrorHint(error, provider);
	}
}
/**
* Official Pi adapter plus bounded provider compatibility and Chat copy.
* `dsh-llm-retry` owns the attempt budget and routes on `code`. Finish chunks
* and thrown errors receive the same route-specific correction and hint.
*/
var PiLoginAdapter = class extends PiAiAdapter {
	native;
	resolveAttachments;
	session;
	constructor(config, native, resolveAttachments, session) {
		super(config);
		this.native = native;
		this.resolveAttachments = resolveAttachments;
		this.session = session;
	}
	resolveModel(provider, model, signal) {
		return super.resolveModel(provider, model, signal).then((info) => {
			const defaultEffort = this.defaultEffort(provider, model);
			if (defaultEffort === void 0 || info.reasoning === void 0) return info;
			return {
				...info,
				reasoning: {
					...info.reasoning,
					defaultEffort: ReasoningEffortId(defaultEffort)
				}
			};
		});
	}
	defaultEffort(provider, model) {
		return (provider === "pi-openrouter" ? openRouterDefaultEffort(this.session.openRouter.model(model)) : void 0) ?? defaultReasoningEffortFor(model);
	}
	sanitize(options) {
		const defaultEffort = this.defaultEffort(options.provider, options.model);
		return {
			...options,
			messages: stripAssistantImages(options.messages),
			...options.reasoningEffort === void 0 && defaultEffort !== void 0 ? { reasoningEffort: ReasoningEffortId(defaultEffort) } : {}
		};
	}
	/**
	* Live `llm.stream` dispatches `prepareCall().stream`, not `adapter.stream()`.
	* Hosted X Search / web_search traces must be stripped on that path too,
	* or Harness executes them as UNKNOWN_TOOL.
	*/
	async *decorateStream(options, source) {
		const capture = { images: [] };
		try {
			const raw = iterateInCapture(capture, this.session.proxy.iterate(source, options.provider === "pi-openai-codex" && options.sessionId !== void 0 ? String(options.sessionId) : void 0));
			const spec = piLoginProviderByRoute(options.provider);
			const api = spec === void 0 ? void 0 : this.session.visibleModels(spec.id).find((model) => model.id === options.model)?.api;
			const filtered = nativePlanForRoute(options.provider, api, this.native) === void 0 ? raw : filterHostedServerToolTraces(raw);
			const attachments = this.native.image ? this.resolveAttachments() : void 0;
			yield* withFailureHints(attachments === void 0 ? filtered : injectHostedImages(filtered, capture, (input) => attachments.saveImage(input)), options.provider);
		} catch (error) {
			throw withModelErrorHint(error, options.provider);
		}
	}
	async prepareCall(provider, model, signal) {
		const prepared = await this.session.proxy.run(() => super.prepareCall(provider, model, signal));
		return {
			...prepared,
			stream: (options) => {
				const sanitized = this.sanitize(options);
				return this.decorateStream(sanitized, prepared.stream(sanitized));
			}
		};
	}
	async *stream(options) {
		const sanitized = this.sanitize(options);
		yield* this.decorateStream(sanitized, super.stream(sanitized));
	}
};
function createPiLoginAdapter(session, resolveAttachments, options = {}) {
	const streamIdleTimeoutMs = options.streamIdleTimeoutMs ?? 3e5;
	const retryPolicy = resolveRetryPolicy(options.retryPolicy, "dsh-oauth-login retryPolicy");
	const requestImageLimits = {
		requestImagePixelBudget: 4194304,
		requestImageMaxBytes: 1048576
	};
	return new PiLoginAdapter({
		profiles: () => {
			const profiles = /* @__PURE__ */ new Map();
			for (const spec of PI_LOGIN_PROVIDERS) profiles.set(spec.route, {
				provider: spec.route,
				displayName: spec.displayName,
				streamIdleTimeoutMs,
				maxRequestImageBytes: PI_LOGIN_MAX_REQUEST_IMAGE_BYTES,
				...requestImageLimits,
				retryPolicy,
				configuredMaxTokens: /* @__PURE__ */ new Map(),
				modelErrors: /* @__PURE__ */ new Map(),
				piProvider: session.provider(spec.id)
			});
			return profiles;
		},
		resolveApiKey: async (route) => {
			await session.ensureTransport();
			const spec = piLoginProviderByRoute(route);
			if (spec === void 0) throw new LlmError(`dsh-oauth-login: unknown route "${route}"`, "MISSING_CREDENTIAL");
			const apiKey = (await session.models.getAuth(spec.id))?.auth.apiKey;
			if (apiKey === void 0 || apiKey.length === 0) throw new LlmError(`${spec.displayName} is not connected. Open Settings → Subscription Login and connect it.`, "MISSING_CREDENTIAL");
			return apiKey;
		},
		resolveAttachments,
		auth: {
			credentials: session.store,
			authContext: defaultProviderAuthContext()
		}
	}, session.native, resolveAttachments, session);
}
//#endregion
//#region src/responses-tap.ts
/** Peek Responses SSE for hosted image_generation_call items pi-ai ignores. */
const TAPPED = Symbol("dsh-oauth-hosted-tap");
function requestUrl(input) {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.href;
	return input.url;
}
function requestMethod(input, init) {
	if (init?.method !== void 0) return init.method.toUpperCase();
	if (typeof input !== "string" && !(input instanceof URL) && input.method.length > 0) return input.method.toUpperCase();
	return "GET";
}
function isResponsesRequest(input, init) {
	if (requestMethod(input, init) !== "POST") return false;
	try {
		const path = new URL(requestUrl(input)).pathname;
		return path === "/responses" || path.endsWith("/responses");
	} catch {
		return false;
	}
}
function parseSseBlock(block) {
	const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n").trim();
	if (data.length === 0 || data === "[DONE]") return void 0;
	try {
		return JSON.parse(data);
	} catch {
		return;
	}
}
function consumeResponsesSseText(text, onEvent) {
	const parts = text.split(/\r?\n\r?\n/);
	const rest = parts.pop() ?? "";
	for (const block of parts) {
		const event = parseSseBlock(block);
		if (event !== void 0) onEvent(event);
	}
	return rest;
}
function peekResponsesBody(body, onEvent) {
	const decoder = new TextDecoder();
	let buffer = "";
	return body.pipeThrough(new TransformStream({
		transform(chunk, controller) {
			controller.enqueue(chunk);
			buffer = consumeResponsesSseText(buffer + decoder.decode(chunk, { stream: true }), onEvent);
		},
		flush(controller) {
			if (buffer.length === 0) return;
			const event = parseSseBlock(buffer);
			if (event !== void 0) onEvent(event);
		}
	}));
}
function tapResponsesResponse(response, onEvent) {
	if (response.body === null) return response;
	return new Response(peekResponsesBody(response.body, onEvent), response);
}
function wrapFetchForHostedOutput(fetchImpl) {
	return async (input, init) => {
		const capture = currentHostedCapture();
		if (capture === void 0 || !isResponsesRequest(input, init)) return await fetchImpl(input, init);
		return tapResponsesResponse(await fetchImpl(input, init), (event) => collectHostedImagesFromEvent(event, capture.images));
	};
}
function installHostedOutputFetch() {
	const current = globalThis.fetch;
	if (current[TAPPED] === true) return;
	const next = Object.assign(wrapFetchForHostedOutput(current), { [TAPPED]: true });
	globalThis.fetch = next;
}
//#endregion
//#region src/http.ts
/** Proxy-aware HTTP transport for OAuth and subscribed-provider requests. */
const originalFetch = globalThis.fetch;
let installedFetch;
const DEFAULT_LOOPBACK_PROXY_CANDIDATES = [
	"http://127.0.0.1:7890",
	"http://127.0.0.1:45678",
	"http://127.0.0.1:7891",
	"http://127.0.0.1:8080",
	"http://127.0.0.1:8888"
];
const PROXY_ENV_KEYS = [
	"HTTPS_PROXY",
	"https_proxy",
	"HTTP_PROXY",
	"http_proxy",
	"ALL_PROXY",
	"all_proxy"
];
function normalizeProxyUrl(value) {
	const trimmed = value.trim();
	if (trimmed.length === 0) throw new Error("dsh-oauth-login: proxy URL is empty");
	const url = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`dsh-oauth-login: unsupported proxy protocol "${url.protocol}"`);
	if (url.hostname.length === 0) throw new Error("dsh-oauth-login: proxy URL has no host");
	url.pathname = "/";
	url.search = "";
	url.hash = "";
	return url.toString();
}
function inheritedProxy(env) {
	for (const key of PROXY_ENV_KEYS) {
		const value = env[key];
		if (value !== void 0 && value.trim().length > 0) return value;
	}
}
function scutilValue(output, key) {
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return output.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, "m"))?.[1];
}
function parseMacOSSystemProxy(output) {
	for (const kind of ["HTTPS", "HTTP"]) {
		if (scutilValue(output, `${kind}Enable`) !== "1") continue;
		const host = scutilValue(output, `${kind}Proxy`);
		const port = Number(scutilValue(output, `${kind}Port`));
		if (host === void 0 || host.length === 0 || !Number.isInteger(port) || port <= 0 || port > 65535) continue;
		return normalizeProxyUrl(`http://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${port}`);
	}
}
async function readMacOSSystemProxy() {
	return await new Promise((resolve) => {
		execFile("/usr/sbin/scutil", ["--proxy"], {
			encoding: "utf8",
			timeout: 1500,
			maxBuffer: 131072
		}, (error, stdout) => resolve(error === null ? parseMacOSSystemProxy(stdout) : void 0));
	});
}
function isLoopbackProxy(proxyUrl) {
	const hostname = new URL(proxyUrl).hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
	return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}
/**
* Verify that a candidate is an HTTP CONNECT proxy. The probe contains no
* OAuth code, credential, token, cookie, or geographic metadata.
*/
async function probeHttpConnectProxy(proxyUrl) {
	const url = new URL(proxyUrl);
	if (url.protocol !== "http:") return false;
	const port = Number(url.port || "80");
	if (!Number.isInteger(port) || port <= 0 || port > 65535) return false;
	return await new Promise((resolve) => {
		const socket = connect({
			host: url.hostname,
			port
		});
		let settled = false;
		let response = "";
		const finish = (accepted) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolve(accepted);
		};
		socket.setTimeout(800);
		socket.once("connect", () => {
			socket.write("CONNECT auth.openai.com:443 HTTP/1.1\r\nHost: auth.openai.com:443\r\nConnection: close\r\n\r\n");
		});
		socket.on("data", (chunk) => {
			response += chunk.toString("latin1");
			const lineEnd = response.indexOf("\r\n");
			if (lineEnd >= 0) finish(/^HTTP\/1\.[01] 200(?:\s|$)/.test(response.slice(0, lineEnd)));
			else if (response.length > 16384) finish(false);
		});
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
		socket.once("end", () => finish(/^HTTP\/1\.[01] 200(?:\s|$)/.test(response)));
	});
}
async function resolveOAuthProxy(options = {}) {
	const env = options.env ?? process.env;
	if (inheritedProxy(env) !== void 0) return { source: "environment" };
	const explicit = env.DSH_OAUTH_PROXY;
	if (explicit !== void 0 && explicit.trim().length > 0) return {
		source: "explicit",
		proxyUrl: normalizeProxyUrl(explicit)
	};
	const probe = options.probe ?? probeHttpConnectProxy;
	if ((options.platform ?? process.platform) === "darwin") {
		const systemProxy = await (options.readSystemProxy ?? readMacOSSystemProxy)();
		if (systemProxy !== void 0) {
			const normalized = normalizeProxyUrl(systemProxy);
			if (await probe(normalized)) return {
				source: "system",
				proxyUrl: normalized
			};
		}
	}
	const normalizedCandidates = (options.candidates ?? DEFAULT_LOOPBACK_PROXY_CANDIDATES).flatMap((candidate) => {
		try {
			const normalized = normalizeProxyUrl(candidate);
			return isLoopbackProxy(normalized) ? [normalized] : [];
		} catch {
			return [];
		}
	});
	const selected = (await Promise.all(normalizedCandidates.map(async (candidate) => {
		try {
			return await probe(candidate);
		} catch {
			return false;
		}
	}))).findIndex(Boolean);
	if (selected >= 0) return {
		source: "loopback",
		proxyUrl: normalizedCandidates[selected]
	};
	return { source: "direct" };
}
function noProxyValue(env) {
	const entries = new Set((env.NO_PROXY ?? env.no_proxy ?? "").split(/[\s,]+/).filter(Boolean));
	entries.add("localhost");
	entries.add("127.0.0.1");
	entries.add("::1");
	return [...entries].join(",");
}
function inheritedProxyOptions(env) {
	const allProxy = env.ALL_PROXY ?? env.all_proxy ?? "";
	return {
		httpProxy: env.HTTP_PROXY ?? env.http_proxy ?? allProxy,
		httpsProxy: env.HTTPS_PROXY ?? env.https_proxy ?? allProxy
	};
}
async function createOAuthHttpTransport(options = {}) {
	const env = options.env ?? process.env;
	const resolution = await resolveOAuthProxy({
		...options,
		env
	});
	const selectedProxy = "proxyUrl" in resolution ? resolution.proxyUrl : void 0;
	const inherited = inheritedProxyOptions(env);
	return {
		dispatcher: new EnvHttpProxyAgent({
			allowH2: false,
			httpProxy: selectedProxy ?? inherited.httpProxy,
			httpsProxy: selectedProxy ?? inherited.httpsProxy,
			noProxy: noProxyValue(env)
		}),
		resolution
	};
}
function installOAuthHttpGlobals() {
	if (installedFetch === void 0 ? globalThis.fetch === originalFetch : globalThis.fetch === installedFetch) {
		install();
		installedFetch = globalThis.fetch;
	}
	installHostedOutputFetch();
}
//#endregion
//#region src/proxy-config.ts
/** Shared, credential-free settings for this plugin's two outbound transports. */
const PROXY_SETTINGS_PATH = "/plugins/dsh-oauth-login/network/settings";
const PROXY_SETTINGS_FILENAME = ".dsh-oauth-proxy.json";
function defaultProxySettings() {
	return {
		revision: 0,
		http: {
			enabled: true,
			url: ""
		},
		websocket: {
			enabled: true,
			url: ""
		}
	};
}
function object(value, keys, label) {
	if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`${label}: invalid settings object`);
	return value;
}
function channel(value, label) {
	const raw = object(value, ["enabled", "url"], label);
	if (typeof raw.enabled !== "boolean" || typeof raw.url !== "string" || raw.url.length > 1024) throw new Error(`${label}: expected enabled and proxy URL`);
	const text = raw.url.trim();
	if (text === "") return {
		enabled: raw.enabled,
		url: ""
	};
	let parsed;
	try {
		parsed = new URL(text);
	} catch {
		throw new Error(`${label}: enter a valid HTTP proxy address and port`);
	}
	if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || parsed.port === "0") throw new Error(`${label}: use an HTTP(S) proxy without credentials, path, query or fragment`);
	return {
		enabled: raw.enabled,
		url: parsed.origin
	};
}
function parseProxySettings(value) {
	const raw = object(value, [
		"revision",
		"http",
		"websocket"
	], "Network");
	if (typeof raw.revision !== "number" || !Number.isSafeInteger(raw.revision) || raw.revision < 0) throw new Error("Network: invalid revision");
	return {
		revision: raw.revision,
		http: channel(raw.http, "HTTP"),
		websocket: channel(raw.websocket, "WebSocket")
	};
}
//#endregion
//#region src/proxy-store.ts
/** Independent, atomic settings file; never writes the OAuth credential document. */
var ProxySettingsConflict = class extends Error {};
var ProxySettingsStore = class {
	filename;
	constructor(filename) {
		this.filename = filename;
	}
	async read() {
		let text;
		try {
			text = await readFile(this.filename, "utf8");
		} catch (error) {
			if (error.code === "ENOENT") return defaultProxySettings();
			throw new Error("Network settings could not be read", { cause: error });
		}
		let document;
		try {
			document = JSON.parse(text);
		} catch {
			throw new Error("Network settings file is not valid JSON");
		}
		if (typeof document !== "object" || document === null || !("version" in document) || document.version !== 1 || !("settings" in document) || Object.keys(document).some((key) => key !== "version" && key !== "settings")) throw new Error("Unsupported network settings file");
		return parseProxySettings(document.settings);
	}
	async save(value) {
		const input = parseProxySettings(value);
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		return withFileLock(this.filename, async () => {
			const current = await this.read();
			if (current.revision !== input.revision) throw new ProxySettingsConflict("Network settings changed. Reload them before saving.");
			const settings = {
				...input,
				revision: current.revision + 1
			};
			await writeFileAtomic(this.filename, `${JSON.stringify({
				version: 1,
				settings
			}, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
			return settings;
		});
	}
};
//#endregion
//#region src/proxy-transport.ts
/** Plugin-scoped HTTP/WS routing without changing process.env or provider SDKs. */
const ROUTING_KEY = Symbol.for("dsh-oauth-login.scoped-proxy.v1");
const globals = globalThis;
const routing = globals[ROUTING_KEY] ??= { context: new AsyncLocalStorage() };
function isLoopback(origin) {
	if (origin === void 0) return false;
	const hostname = new URL(origin).hostname.toLowerCase().replace(/^\[|\]$/g, "");
	return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1" || isIP(hostname) === 4 && hostname.startsWith("127.");
}
function installRouting() {
	const fallback = getGlobalDispatcher();
	if (fallback !== routing.dispatcher) {
		routing.dispatcher = fallback.compose((dispatch) => (options, handler) => {
			const scope = routing.context.getStore();
			if (scope === void 0) return dispatch(options, handler);
			const websocket = typeof options.upgrade === "string" && options.upgrade.toLowerCase() === "websocket";
			return (isLoopback(options.origin) ? scope.direct : websocket ? scope.websocket : scope.http).dispatch(options, handler);
		});
		setGlobalDispatcher(routing.dispatcher);
	}
	installOAuthHttpGlobals();
}
var OAuthProxyTransport = class {
	discovery;
	settings;
	readyPromise;
	generations = /* @__PURE__ */ new Set();
	sessions = /* @__PURE__ */ new Map();
	disposed = false;
	constructor(filename, discovery = {}) {
		this.discovery = discovery;
		this.settings = new ProxySettingsStore(filename);
	}
	async build() {
		const settings = await this.settings.read();
		const auto = [settings.http, settings.websocket].some((channel) => channel.enabled && channel.url === "") ? await createOAuthHttpTransport(this.discovery) : void 0;
		const direct = new Agent({ allowH2: false });
		const agents = /* @__PURE__ */ new Set([direct, ...auto === void 0 ? [] : [auto.dispatcher]]);
		const select = (channel) => {
			if (!channel.enabled) return direct;
			if (channel.url === "") {
				if (auto === void 0) throw new Error("Automatic proxy transport is unavailable");
				return auto.dispatcher;
			}
			const proxy = new ProxyAgent({
				uri: channel.url,
				allowH2: false
			});
			agents.add(proxy);
			return proxy;
		};
		const ready = {
			scope: {
				direct,
				http: select(settings.http),
				websocket: select(settings.websocket)
			},
			resolution: !settings.http.enabled ? { source: "direct" } : settings.http.url !== "" ? {
				source: "explicit",
				proxyUrl: settings.http.url
			} : auto?.resolution ?? { source: "direct" },
			agents,
			wsKey: JSON.stringify(settings.websocket) + (settings.websocket.enabled && !settings.websocket.url ? `:${settings.revision}` : ""),
			active: 0,
			retired: false,
			closing: false
		};
		if (this.disposed) {
			await Promise.allSettled([...agents].map((agent) => agent.destroy()));
			throw new Error("OAuth proxy transport disposed");
		}
		this.generations.add(ready);
		installRouting();
		return ready;
	}
	ready() {
		if (this.disposed) return Promise.reject(/* @__PURE__ */ new Error("OAuth proxy transport disposed"));
		if (this.readyPromise === void 0) {
			const pending = this.build();
			this.readyPromise = pending;
			pending.catch(() => {
				if (this.readyPromise === pending) this.readyPromise = void 0;
			});
		}
		return this.readyPromise;
	}
	async initialize() {
		return (await this.ready()).resolution;
	}
	async acquire() {
		while (true) {
			const ready = await this.ready();
			if (ready.retired) continue;
			ready.active++;
			return ready;
		}
	}
	async save(value) {
		if (this.disposed) throw new Error("OAuth proxy transport disposed");
		const saved = await this.settings.save(value);
		const previous = this.readyPromise;
		this.readyPromise = void 0;
		previous?.then((ready) => {
			ready.retired = true;
			this.release(ready, false);
		}, () => void 0);
		return saved;
	}
	release(ready, decrement = true) {
		if (decrement) ready.active--;
		if (ready.retired && ready.active === 0 && !ready.closing) {
			ready.closing = true;
			Promise.allSettled([...ready.agents].map((agent) => agent.close())).then(() => {
				this.generations.delete(ready);
			});
		}
	}
	async run(operation) {
		const ready = await this.acquire();
		try {
			installRouting();
			return await routing.context.run(ready.scope, operation);
		} finally {
			this.release(ready);
		}
	}
	beginSession(sessionId, ready) {
		if (sessionId === void 0) return void 0;
		let record = this.sessions.get(sessionId);
		if (record === void 0) {
			record = {
				key: ready.wsKey,
				active: 0,
				resetPending: false
			};
			this.sessions.set(sessionId, record);
		}
		if (record.key !== ready.wsKey) record.resetPending = true;
		if (record.resetPending && record.active === 0) {
			closeOpenAICodexWebSocketSessions(sessionId);
			record.key = ready.wsKey;
			record.resetPending = false;
		}
		record.active++;
		return () => {
			record.active--;
		};
	}
	async *iterate(source, codexSessionId) {
		const ready = await this.acquire();
		let endSession;
		let iterator;
		try {
			installRouting();
			endSession = this.beginSession(codexSessionId, ready);
			iterator = routing.context.run(ready.scope, () => source[Symbol.asyncIterator]());
			while (true) {
				const current = iterator;
				const item = await routing.context.run(ready.scope, () => current.next());
				if (item.done) return;
				yield item.value;
			}
		} finally {
			try {
				await routing.context.run(ready.scope, () => iterator?.return?.());
			} finally {
				endSession?.();
				this.release(ready);
			}
		}
	}
	async dispose() {
		this.disposed = true;
		await this.readyPromise?.catch(() => void 0);
		for (const sessionId of this.sessions.keys()) closeOpenAICodexWebSocketSessions(sessionId);
		this.sessions.clear();
		await Promise.allSettled([...this.generations].flatMap((ready) => [...ready.agents].map((agent) => agent.destroy())));
		this.generations.clear();
	}
};
//#endregion
//#region src/openrouter-free.ts
const FREE_ONLY_MESSAGE = "OpenRouter 免费保护：该模型已下线、价格变化或价格未确认，已阻止付费调用。请刷新模型列表并重新选择免费模型。";
function protectOpenRouterPayload(payload, modelId) {
	const source = objectValue(payload);
	if (source === void 0) throw new LlmError(FREE_ONLY_MESSAGE, "OPENROUTER_FREE_ONLY");
	const result = { ...source };
	for (const key of [
		"models",
		"route",
		"router",
		"preset",
		"web_search_options",
		"image_config",
		"audio"
	]) delete result[key];
	result.model = modelId;
	const pluginIds = /* @__PURE__ */ new Set([
		"web",
		"file-parser",
		"response-healing",
		"fusion",
		"pareto-router",
		"context-compression"
	]);
	if (Array.isArray(source.plugins)) for (const plugin of source.plugins) {
		const id = objectValue(plugin)?.id;
		if (typeof id === "string") pluginIds.add(id);
	}
	result.plugins = [...pluginIds].map((id) => ({
		id,
		enabled: false
	}));
	result.modalities = ["text"];
	result.provider = {
		...objectValue(source.provider),
		allow_fallbacks: false,
		require_parameters: true,
		max_price: {
			prompt: 0,
			completion: 0,
			request: 0,
			image: 0,
			audio: 0
		}
	};
	if (Array.isArray(result.tools) && result.tools.some((tool) => objectValue(tool)?.type !== "function")) throw new LlmError("OpenRouter 免费保护：免费调用不启用收费的服务端工具；请选择支持工具调用的免费模型。", "OPENROUTER_FREE_ONLY");
	if (Array.isArray(result.messages)) for (const message of result.messages) {
		const content = objectValue(message)?.content;
		if (Array.isArray(content) && content.some((part) => !["text", "image_url"].includes(String(objectValue(part)?.type)))) throw new LlmError("OpenRouter 免费保护：仅支持文本和图片输入，不启用收费文件解析或音视频处理。", "OPENROUTER_FREE_ONLY");
	}
	return result;
}
function prepareOpenRouterOptions(model, options, catalog) {
	const metadata = catalog?.model(model.id);
	const protectedAtStart = catalog?.protects(model.id) === true || model.id.endsWith(":free") || model.id === "openrouter/free" || metadata === void 0 && model.cost.input === 0 && model.cost.output === 0;
	const defaultEffort = openRouterDefaultEffort(metadata);
	const existing = options.onPayload;
	return {
		...options,
		onPayload: async (payload, currentModel) => {
			const result = await existing?.(payload, currentModel) ?? payload;
			const data = objectValue(result);
			if (data !== void 0 && metadata?.reasoningMandatory) {
				const reasoning = objectValue(data.reasoning);
				if (reasoning?.effort === void 0 || reasoning.effort === "none") data.reasoning = {
					...reasoning,
					effort: defaultEffort ?? "high"
				};
			}
			if (!protectedAtStart && catalog?.protects(model.id) !== true) return result;
			const latest = catalog?.model(model.id);
			if (catalog?.models() !== void 0 && latest?.priceStatus !== "free") throw new LlmError(FREE_ONLY_MESSAGE, "OPENROUTER_FREE_ONLY");
			return protectOpenRouterPayload(result, model.id);
		}
	};
}
//#endregion
//#region src/provider.ts
/** Installed pi-ai providers remapped onto independent harness routes. */
function harnessApiKeyAuth(name) {
	return {
		name,
		resolve: ({ credential }) => Promise.resolve({
			auth: credential?.key === void 0 ? {} : { apiKey: credential.key },
			source: name
		})
	};
}
function catalogProvider(id) {
	const base = builtinProviders().find((candidate) => candidate.id === id);
	if (base === void 0) throw new Error(`dsh-oauth-login: the installed pi-ai catalog ships no "${id}" provider`);
	return base;
}
/**
* Catalog models plus plugin-owned extras, remapped onto the harness route.
* Extras fill gaps the installed pi-ai version has not shipped yet (e.g. grok-4.6).
*/
/**
* Prefer the extra's effort map when the installed catalog still lacks one.
* Official OpenRouter generation currently sets `reasoning: true` and no map.
*/
function overlayExtraModel(model, extra) {
	const transport = model.provider === "xai" && model.id === "grok-4.6" && extra.api === "openai-responses" ? {
		api: extra.api,
		compat: extra.compat
	} : {};
	const reasoning = extra.thinkingLevelMap !== void 0 && model.thinkingLevelMap === void 0 ? {
		reasoning: extra.reasoning,
		thinkingLevelMap: extra.thinkingLevelMap
	} : {};
	if (Object.keys(transport).length === 0 && Object.keys(reasoning).length === 0) return model;
	return {
		...model,
		...transport,
		...reasoning
	};
}
function harnessModels(spec, catalog) {
	const base = catalogProvider(spec.id).getModels();
	const extras = extraModelsFor(spec.id);
	const extraById = new Map(extras.map((model) => [model.id, model]));
	const seen = /* @__PURE__ */ new Set();
	const merged = [];
	for (const model of base) {
		seen.add(model.id);
		const extra = extraById.get(model.id);
		merged.push(extra === void 0 ? model : overlayExtraModel(model, extra));
	}
	for (const extra of extras) {
		if (seen.has(extra.id)) continue;
		seen.add(extra.id);
		merged.push(extra);
	}
	const live = spec.id === "openrouter" ? catalog?.models() : void 0;
	const byId = new Map(merged.map((model) => [model.id, model]));
	return (live === void 0 ? merged : live.map((info) => openRouterPiModel(info, byId.get(info.id)))).map((model) => model.provider === spec.route ? model : {
		...model,
		provider: spec.route
	});
}
function preferredModel(spec, models = harnessModels(spec)) {
	const ids = new Set(models.map((model) => model.id));
	for (const candidate of spec.preferredModels) if (ids.has(candidate)) return candidate;
	return models[0]?.id ?? spec.id;
}
function harnessProvider(spec, native = DEFAULT_NATIVE_TOOL_POLICY, catalog) {
	const base = catalogProvider(spec.id);
	return {
		id: spec.route,
		name: spec.displayName,
		...base.baseUrl === void 0 ? {} : { baseUrl: base.baseUrl },
		auth: {
			...base.auth,
			apiKey: harnessApiKeyAuth(spec.displayName)
		},
		getModels: () => harnessModels(spec, catalog),
		stream: (model, context, options) => {
			const request = prepareNativeToolRequest(context, options ?? {}, spec.id, model.api, native);
			const guarded = spec.id === "openrouter" ? prepareOpenRouterOptions(model, request.options, catalog) : request.options;
			return base.stream(model, normalizeContext(request.context), guarded);
		},
		streamSimple: (model, context, options) => {
			const request = prepareNativeToolRequest(context, options ?? {}, spec.id, model.api, native);
			const guarded = spec.id === "openrouter" ? prepareOpenRouterOptions(model, request.options, catalog) : request.options;
			return base.streamSimple(model, normalizeContext(request.context), guarded);
		}
	};
}
function allCatalogProviders() {
	return PI_LOGIN_PROVIDERS.map((spec) => catalogProvider(spec.id));
}
//#endregion
//#region src/store.ts
/**
* Multi-provider subscription credential store. File is $DSH_HOME/.dsh-oauth-auth.json.
* The old .pi-login-auth.json name is read only as a DSH-owned migration source.
* Never ~/.codex, ~/.grok, ~/.claude, or ~/.pi/agent/auth.json.
*/
const AUTH_FORMAT_VERSION = 1;
const OAUTH_ALLOWED_FIELDS = /* @__PURE__ */ new Set([
	"type",
	"access",
	"refresh",
	"expires",
	"accountId",
	"enterpriseUrl",
	"availableModelIds"
]);
const API_KEY_ALLOWED_FIELDS = /* @__PURE__ */ new Set([
	"type",
	"key",
	"env"
]);
function isENOENT(error) {
	return error?.code === "ENOENT";
}
async function assertOwnerOnly(filename) {
	let mode;
	try {
		mode = (await stat(filename)).mode;
	} catch (error) {
		if (isENOENT(error)) return;
		throw error;
	}
	if (process.platform === "win32") return;
	if ((mode & 63) !== 0) throw new Error(`pi-login: ${filename} is readable beyond its owner (mode ${(mode & 511).toString(8)}); run "chmod 600 ${filename}" before starting again`);
}
function parseProviderEnv(raw, filename, providerId) {
	if (raw === void 0) return void 0;
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`pi-login: ${filename} credential for ${providerId} env must be an object`);
	const env = {};
	for (const [key, value] of Object.entries(raw)) {
		if (typeof value !== "string") throw new Error(`pi-login: ${filename} credential for ${providerId} env values must be strings`);
		env[key] = value;
	}
	return env;
}
function parseCredential(raw, filename, providerId) {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`pi-login: ${filename} credential for ${providerId} must be an object`);
	const credential = raw;
	const type = credential["type"];
	const allowed = type === "oauth" ? OAUTH_ALLOWED_FIELDS : type === "api_key" ? API_KEY_ALLOWED_FIELDS : void 0;
	if (allowed === void 0) throw new Error(`pi-login: ${filename} credential for ${providerId} type must be oauth or api_key`);
	if (Object.keys(credential).some((key) => !allowed.has(key))) throw new Error(`pi-login: ${filename} credential for ${providerId} contains an unknown field`);
	if (type === "api_key") {
		if (typeof credential["key"] !== "string" || credential["key"].length === 0) throw new Error(`pi-login: ${filename} credential for ${providerId} key must be a non-empty string`);
		const env = parseProviderEnv(credential["env"], filename, providerId);
		return {
			type: "api_key",
			key: credential["key"],
			...env === void 0 ? {} : { env }
		};
	}
	if (typeof credential["access"] !== "string" || credential["access"].length === 0) throw new Error(`pi-login: ${filename} credential for ${providerId} access must be a non-empty string`);
	if (typeof credential["refresh"] !== "string") throw new Error(`pi-login: ${filename} credential for ${providerId} refresh must be a string`);
	if (typeof credential["expires"] !== "number" || !Number.isFinite(credential["expires"]) || credential["expires"] <= 0) throw new Error(`pi-login: ${filename} credential for ${providerId} expires must be a positive finite number`);
	return credential;
}
function parseDocument(text, filename) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`pi-login: ${filename} is not valid JSON`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`pi-login: ${filename} must contain an object`);
	const document = value;
	if (document["version"] !== AUTH_FORMAT_VERSION) throw new Error(`pi-login: ${filename} has unsupported auth format version ${String(document["version"])}`);
	if (Object.keys(document).some((key) => key !== "version" && key !== "credentials")) throw new Error(`pi-login: ${filename} contains an unknown top-level field`);
	const raw = document["credentials"];
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`pi-login: ${filename} credentials must be an object`);
	const owned = new Set(PI_LOGIN_PROVIDERS.map((provider) => provider.id));
	const credentials = {};
	for (const [providerId, entry] of Object.entries(raw)) {
		if (!owned.has(providerId)) throw new Error(`pi-login: ${filename} contains an unknown provider "${providerId}"`);
		credentials[providerId] = parseCredential(entry, filename, providerId);
	}
	return {
		version: AUTH_FORMAT_VERSION,
		credentials
	};
}
function cloneCredential(credential) {
	return structuredClone(credential);
}
function piLoginAuthPath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), PI_LOGIN_AUTH_FILENAME));
}
var PiLoginCredentialStore = class {
	filename;
	legacyFilename;
	constructor(filename = piLoginAuthPath()) {
		this.filename = resolve(filename);
		this.legacyFilename = basename(this.filename) === ".dsh-oauth-auth.json" ? resolve(join(dirname(this.filename), LEGACY_PI_LOGIN_AUTH_FILENAME)) : void 0;
	}
	async readDocument() {
		const candidates = [this.filename, ...this.legacyFilename === void 0 ? [] : [this.legacyFilename]];
		for (const filename of candidates) {
			await assertOwnerOnly(filename);
			try {
				return parseDocument(await readFile(filename, "utf8"), filename);
			} catch (error) {
				if (isENOENT(error)) continue;
				throw error;
			}
		}
		return {
			version: AUTH_FORMAT_VERSION,
			credentials: {}
		};
	}
	async read(providerId, options) {
		options?.signal?.throwIfAborted();
		const credential = (await this.readDocument()).credentials[providerId];
		options?.signal?.throwIfAborted();
		return credential === void 0 ? void 0 : cloneCredential(credential);
	}
	async list(options) {
		options?.signal?.throwIfAborted();
		const document = await this.readDocument();
		options?.signal?.throwIfAborted();
		return Object.entries(document.credentials).map(([providerId, credential]) => ({
			providerId,
			type: credential.type
		}));
	}
	async modify(providerId, fn, options) {
		if (!PI_LOGIN_PROVIDERS.some((provider) => provider.id === providerId)) throw new Error(`pi-login: credential store does not own provider "${providerId}"`);
		options?.signal?.throwIfAborted();
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		options?.signal?.throwIfAborted();
		return withFileLock(this.filename, async () => {
			options?.signal?.throwIfAborted();
			const document = await this.readDocument();
			options?.signal?.throwIfAborted();
			const current = document.credentials[providerId];
			const candidate = await fn(current === void 0 ? void 0 : cloneCredential(current));
			options?.signal?.throwIfAborted();
			if (candidate === void 0) return current === void 0 ? void 0 : cloneCredential(current);
			const next = parseCredential(candidate, this.filename, providerId);
			const credentials = {
				...document.credentials,
				[providerId]: next
			};
			await writeFileAtomic(this.filename, `${JSON.stringify({
				version: AUTH_FORMAT_VERSION,
				credentials
			}, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
			return cloneCredential(next);
		});
	}
	async delete(providerId, options) {
		if (!PI_LOGIN_PROVIDERS.some((provider) => provider.id === providerId)) return;
		options?.signal?.throwIfAborted();
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		options?.signal?.throwIfAborted();
		await withFileLock(this.filename, async () => {
			options?.signal?.throwIfAborted();
			const document = await this.readDocument();
			options?.signal?.throwIfAborted();
			if (document.credentials[providerId] === void 0) return;
			const { [providerId]: _removed, ...credentials } = document.credentials;
			if (Object.keys(credentials).length === 0) {
				await rm(this.filename, { force: true });
				return;
			}
			await writeFileAtomic(this.filename, `${JSON.stringify({
				version: AUTH_FORMAT_VERSION,
				credentials
			}, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
		});
	}
};
//#endregion
//#region src/auth.ts
/** DSH-owned models.login() for every subscribed provider in the catalog. */
async function loginPiProvider(providerId, interaction, store = new PiLoginCredentialStore()) {
	const spec = requirePiLoginProvider(providerId);
	const models = createModels({ credentials: store });
	models.setProvider(catalogProvider(providerId));
	const proxy = new OAuthProxyTransport(join(dirname(store.filename), PROXY_SETTINGS_FILENAME));
	try {
		await proxy.run(() => models.login(providerId, spec.authType, interaction));
	} finally {
		await proxy.dispose();
	}
}
async function logoutPiProvider(providerId, store = new PiLoginCredentialStore()) {
	requirePiLoginProvider(providerId);
	await store.delete(providerId);
}
async function piLoginStatus(store = new PiLoginCredentialStore(), providerId) {
	const ids = providerId === void 0 ? (await store.list()).map((item) => item.providerId) : [providerId];
	const out = [];
	for (const id of ids) {
		const credential = await store.read(id);
		if (credential?.type === "oauth") {
			out.push({
				providerId: id,
				authenticated: true,
				credentialType: "oauth",
				expiresAt: new Date(credential.expires)
			});
			continue;
		}
		if (credential?.type === "api_key" && typeof credential.key === "string" && credential.key.length > 0) {
			out.push({
				providerId: id,
				authenticated: true,
				credentialType: "api_key"
			});
			continue;
		}
		out.push({
			providerId: id,
			authenticated: false
		});
	}
	return out;
}
async function loginPiProviderSession(providerId, interaction, session) {
	const spec = requirePiLoginProvider(providerId);
	await session.ensureTransport();
	session.models.setProvider(catalogProvider(providerId));
	await session.proxy.run(() => session.models.login(providerId, spec.authType, interaction));
	if (providerId === "openrouter") await session.openRouter.syncAuthentication("login");
}
//#endregion
//#region src/redact.ts
/** Remove token-like strings from an external OAuth diagnostic. */
function safeMessage(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted token]").replace(/(\b(?:code|token|refresh_token|access_token|api[_-]?key|key)=)[^&\s]+/giu, "$1[redacted]").slice(0, 1e3);
}
/** Only this provider's official HTTPS hosts may be opened for login. */
function isSafeAuthUrl(raw, provider) {
	try {
		const url = new URL(raw);
		if (url.protocol !== "https:") return false;
		const host = url.hostname.toLowerCase();
		if (provider.allowedHosts.includes(host)) return true;
		return provider.allowedSuffixes.some((suffix) => host.endsWith(suffix));
	} catch {
		return false;
	}
}
//#endregion
//#region src/auth-routes.ts
const PI_LOGIN_AUTH_STATUS_PATH = "/plugins/dsh-oauth-login/auth/status";
const PI_LOGIN_AUTH_LOGIN_PATH = "/plugins/dsh-oauth-login/auth/login";
const PI_LOGIN_AUTH_CANCEL_PATH = "/plugins/dsh-oauth-login/auth/cancel";
const PI_LOGIN_AUTH_COMPLETE_PATH = "/plugins/dsh-oauth-login/auth/complete";
const PI_LOGIN_AUTH_LOGOUT_PATH = "/plugins/dsh-oauth-login/auth/logout";
/** Preserve the Pi prompt discriminator on the browser wire contract. */
function loginInputChallenge(prompt) {
	return {
		type: prompt.type,
		message: prompt.message,
		..."placeholder" in prompt && prompt.placeholder !== void 0 ? { placeholder: prompt.placeholder } : {}
	};
}
/** Keep the browser authorization URL available while Pi also waits for a manual callback. */
function mergeLoginChallenge(previous, next) {
	return {
		...next,
		...next.url === void 0 && previous?.url !== void 0 ? { url: previous.url } : {},
		...next.userCode === void 0 && previous?.userCode !== void 0 ? { userCode: previous.userCode } : {}
	};
}
function waitForPromptAbort(prompt) {
	const signal = prompt.signal;
	if (signal === void 0) return new Promise(() => {});
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise((_resolve, reject) => {
		signal.addEventListener("abort", () => {
			reject(signal.reason);
		}, { once: true });
	});
}
function answerSelectPrompt(prompt) {
	if (prompt.type === "select") {
		const oauth = prompt.options.find((option) => option.id === "oauth" || option.id.includes("oauth"));
		const browser = prompt.options.find((option) => option.id.includes("browser"));
		return oauth?.id ?? browser?.id ?? prompt.options[0]?.id ?? "oauth";
	}
}
var ProviderAuth = class {
	spec;
	session;
	state = { status: "signed-out" };
	operation;
	nextOperationId = 0;
	challenge;
	challengeWaiters = [];
	pendingInput;
	constructor(spec, session) {
		this.spec = spec;
		this.session = session;
	}
	async snapshot() {
		if (this.operation !== void 0) return this.state;
		if (this.state.status === "error") return this.state;
		return this.readStored();
	}
	async signIn() {
		if (this.operation === void 0) this.start();
		if (this.challenge !== void 0) return this.challenge;
		return new Promise((resolve, reject) => {
			this.challengeWaiters.push({
				resolve,
				reject
			});
		});
	}
	async signOut() {
		const revision = this.nextOperationId;
		const error = /* @__PURE__ */ new Error("Pi login cancelled");
		this.stop(this.operation, error);
		await this.session.logout(this.spec.id);
		if (this.operation === void 0 && this.nextOperationId === revision) {
			this.state = { status: "signed-out" };
			this.challenge = void 0;
		}
	}
	async cancel() {
		const revision = this.nextOperationId;
		const error = /* @__PURE__ */ new Error("Pi login cancelled");
		this.stop(this.operation, error);
		const stored = await this.readStored();
		if (this.operation === void 0 && this.nextOperationId === revision) {
			this.state = stored;
			this.challenge = void 0;
		}
	}
	async submitInput(value) {
		const pending = this.pendingInput;
		if (pending === void 0) throw new Error(`${this.spec.displayName} is not waiting for a credential`);
		const normalized = value.trim();
		if (normalized.length === 0) throw new Error("credential must not be empty");
		if (normalized.length > 4096) throw new Error("credential is too long");
		const operation = this.operation;
		if (operation === void 0 || operation.id !== pending.operationId) throw new Error(`${this.spec.displayName} login operation is no longer active`);
		pending.resolve(normalized);
		await operation.done;
		if (operation.cancelled !== void 0) throw operation.cancelled;
		if (operation.failure !== void 0) throw operation.failure;
		return operation.result ?? this.state;
	}
	/** Wait until an in-flight sign-in settles (success or error). No-op if idle. */
	async waitUntilSettled() {
		await this.operation?.done;
	}
	async dispose() {
		const error = /* @__PURE__ */ new Error("Pi login plugin disposed");
		this.stop(this.operation, error);
	}
	start() {
		const cancellation = new AbortController();
		const id = ++this.nextOperationId;
		let finish;
		const operation = {
			id,
			cancellation,
			done: new Promise((resolve) => {
				finish = resolve;
			}),
			finish
		};
		this.operation = operation;
		this.challenge = void 0;
		this.pendingInput = void 0;
		this.state = { status: "signing-in" };
		loginPiProviderSession(this.spec.id, {
			signal: cancellation.signal,
			prompt: (prompt) => this.onPrompt(id, prompt),
			notify: (event) => {
				this.onEvent(id, event);
			}
		}, this.session).then(async () => {
			if (!this.isCurrent(id)) return;
			const stored = await this.readStored();
			if (!this.isCurrent(id)) return;
			operation.result = stored;
			this.state = stored;
		}).catch((error) => {
			if (!this.isCurrent(id)) return;
			this.rejectChallenge(error);
			this.rejectInput(error);
			operation.failure = new Error(safeMessage(error));
			this.state = {
				status: "error",
				message: operation.failure.message
			};
		}).finally(() => {
			if (this.isCurrent(id)) this.operation = void 0;
			operation.finish();
		});
	}
	onPrompt(operationId, prompt) {
		if (!this.isCurrent(operationId)) return Promise.reject(/* @__PURE__ */ new Error("Pi login cancelled"));
		const selected = answerSelectPrompt(prompt);
		if (selected !== void 0) return Promise.resolve(selected);
		if (prompt.type === "text" && this.spec.authType === "oauth") return Promise.resolve("");
		if (prompt.type === "secret" || prompt.type === "manual_code" || prompt.type === "text") return this.requestInput(operationId, prompt);
		return waitForPromptAbort(prompt);
	}
	requestInput(operationId, prompt) {
		if (this.pendingInput !== void 0) return Promise.reject(/* @__PURE__ */ new Error(`${this.spec.displayName} already has a pending credential prompt`));
		const input = loginInputChallenge(prompt);
		const operation = this.operation;
		if (operation === void 0 || operation.id !== operationId) return Promise.reject(/* @__PURE__ */ new Error("Pi login cancelled"));
		const signals = [operation.cancellation.signal, prompt.signal].filter((signal) => signal !== void 0);
		const wait = new Promise((resolve, reject) => {
			let settled = false;
			const onAbort = () => {
				const signal = signals.find((candidate) => candidate.aborted);
				settleReject(signal?.reason ?? /* @__PURE__ */ new Error("credential prompt cancelled"));
			};
			const cleanup = () => {
				for (const signal of signals) signal.removeEventListener("abort", onAbort);
			};
			const settleResolve = (value) => {
				if (settled) return;
				settled = true;
				cleanup();
				this.pendingInput = void 0;
				resolve(value);
			};
			const settleReject = (error) => {
				if (settled) return;
				settled = true;
				cleanup();
				this.pendingInput = void 0;
				reject(error);
			};
			this.pendingInput = {
				operationId,
				resolve: settleResolve,
				reject: settleReject
			};
			for (const signal of signals) signal.addEventListener("abort", onAbort, { once: true });
			if (signals.some((signal) => signal.aborted)) onAbort();
		});
		this.acceptChallenge({
			provider: this.spec.id,
			kind: "input",
			...this.spec.loginUrl === void 0 ? {} : { url: this.spec.loginUrl },
			input
		});
		return wait;
	}
	onEvent(operationId, event) {
		if (!this.isCurrent(operationId)) return;
		if (event.type === "device_code") {
			this.acceptChallenge({
				provider: this.spec.id,
				kind: "browser",
				url: event.verificationUri,
				...event.userCode.length > 0 ? { userCode: event.userCode } : {}
			});
			return;
		}
		if (event.type === "auth_url") this.acceptChallenge({
			provider: this.spec.id,
			kind: "browser",
			url: event.url
		});
	}
	acceptChallenge(challenge) {
		if (challenge.url !== void 0 && !isSafeAuthUrl(challenge.url, this.spec)) {
			const error = /* @__PURE__ */ new Error(`${this.spec.id} returned an authorization URL outside its official hosts`);
			this.stop(this.operation, error);
			return;
		}
		const merged = mergeLoginChallenge(this.challenge, challenge);
		this.challenge = merged;
		this.state = {
			status: "signing-in",
			kind: merged.kind,
			...merged.url === void 0 ? {} : { url: merged.url },
			...merged.userCode === void 0 ? {} : { userCode: merged.userCode },
			...merged.input === void 0 ? {} : { input: merged.input }
		};
		for (const waiter of this.challengeWaiters.splice(0)) waiter.resolve(merged);
	}
	async readStored() {
		const [stored] = await piLoginStatus(this.session.store, this.spec.id);
		if (stored === void 0 || !stored.authenticated) return { status: "signed-out" };
		return {
			status: "signed-in",
			models: this.session.visibleModels(this.spec.id).map((model) => model.id),
			...stored.expiresAt === void 0 || Number.isNaN(stored.expiresAt.valueOf()) ? {} : { expiresAt: stored.expiresAt.toISOString() }
		};
	}
	rejectChallenge(error) {
		for (const waiter of this.challengeWaiters.splice(0)) waiter.reject(error);
	}
	rejectInput(error) {
		this.pendingInput?.reject(error);
	}
	isCurrent(operationId) {
		return this.operation?.id === operationId;
	}
	stop(operation, error) {
		if (operation === void 0 || this.operation?.id !== operation.id) return;
		this.operation = void 0;
		operation.cancelled = error;
		this.rejectChallenge(error);
		this.rejectInput(error);
		operation.cancellation.abort(error);
		operation.finish();
	}
};
var PiLoginWebAuth = class {
	session;
	byId = /* @__PURE__ */ new Map();
	constructor(session) {
		this.session = session;
		for (const spec of PI_LOGIN_PROVIDERS) this.byId.set(spec.id, new ProviderAuth(spec, session));
	}
	slot(id) {
		const slot = this.byId.get(id);
		if (slot === void 0) throw new Error(`dsh-oauth-login: unknown provider "${id}"`);
		return slot;
	}
	async status() {
		await this.session.refreshStoredGrants();
		await this.session.openRouter.syncAuthentication();
		const out = [];
		for (const spec of PI_LOGIN_PROVIDERS) out.push({
			id: spec.id,
			route: spec.route,
			displayName: spec.displayName,
			shortName: spec.shortName,
			authType: spec.authType,
			account: await this.slot(spec.id).snapshot()
		});
		return out;
	}
	async signIn(id) {
		requirePiLoginProvider(id);
		return this.slot(id).signIn();
	}
	async signOut(id) {
		requirePiLoginProvider(id);
		await this.slot(id).signOut();
	}
	async cancel(id) {
		requirePiLoginProvider(id);
		await this.slot(id).cancel();
	}
	async submitInput(id, value) {
		requirePiLoginProvider(id);
		return this.slot(id).submitInput(value);
	}
	/** Wait until the named provider's in-flight sign-in settles. */
	async waitUntilSettled(id) {
		requirePiLoginProvider(id);
		await this.slot(id).waitUntilSettled();
	}
	async dispose() {
		await Promise.all([...this.byId.values()].map((slot) => slot.dispose()));
	}
};
function trustedRequest(req) {
	const remote = req.socket.remoteAddress;
	if (remote !== "127.0.0.1" && remote !== "::1" && remote !== "::ffff:127.0.0.1") return false;
	if (req.headers["sec-fetch-site"] === "cross-site") return false;
	const host = req.headers.host;
	if (host === void 0) return false;
	const origin = req.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === new URL(`http://${host}`).host;
	} catch {
		return false;
	}
}
function trustedProxyRequest(req) {
	if (!trustedRequest(req)) return false;
	try {
		const host = new URL(`http://${req.headers.host}`).hostname;
		return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
	} catch {
		return false;
	}
}
function rejectWebRequest(ctx, req, res, proxy = false) {
	const rejection = ctx.connection.requestRejection(req);
	if (rejection !== void 0) {
		json(res, rejection, { error: rejection === 401 ? "unauthorized" : "forbidden" });
		return true;
	}
	if (proxy ? !trustedProxyRequest(req) : !trustedRequest(req)) {
		json(res, 403, { error: "forbidden" });
		return true;
	}
	return false;
}
function json(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
async function readJson(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > 4096) throw new Error("request body too large");
		chunks.push(chunk);
	}
	if (chunks.length === 0) return {};
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function providerIdFrom(value) {
	if (typeof value !== "object" || value === null || !("provider" in value) || typeof value.provider !== "string") throw new Error("expected { \"provider\": \"<id>\" }");
	return requirePiLoginProvider(value.provider).id;
}
function providerInputFrom(value) {
	if (typeof value !== "object" || value === null || !("provider" in value) || typeof value.provider !== "string" || !("value" in value) || typeof value.value !== "string") throw new Error("expected { \"provider\": \"<id>\", \"value\": \"<credential>\" }");
	return {
		providerId: requirePiLoginProvider(value.provider).id,
		value: value.value
	};
}
function registerPiLoginAuthRoutes(ctx, session, options = {}) {
	const auth = new PiLoginWebAuth(session);
	const notifyAuthChanged = async () => {
		await options.onAuthChanged?.();
	};
	ctx.effect(() => {
		const routes = [
			ctx.webServer.register({
				kind: "exact",
				path: PROXY_SETTINGS_PATH,
				handler: async (req, res) => {
					if (rejectWebRequest(ctx, req, res, true)) return;
					if (req.method === "GET") try {
						return json(res, 200, await session.proxy.settings.read());
					} catch {
						return json(res, 503, { error: "Network settings could not be read" });
					}
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					if (req.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") return json(res, 415, { error: "application/json required" });
					let settings;
					try {
						settings = parseProxySettings(await readJson(req));
					} catch {
						return json(res, 400, { error: "Invalid network settings: use HTTP(S) proxy URLs without credentials or paths" });
					}
					try {
						json(res, 200, await session.proxy.save(settings));
					} catch (error) {
						if (error instanceof ProxySettingsConflict) return json(res, 409, { error: error.message });
						json(res, 503, { error: "Network settings could not be saved" });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: OPENROUTER_CATALOG_PATH,
				handler: async (req, res) => {
					if (rejectWebRequest(ctx, req, res)) return;
					if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
					try {
						await session.openRouter.syncAuthentication();
						json(res, 200, session.openRouter.snapshot());
					} catch {
						json(res, 503, { error: "OpenRouter model catalog unavailable" });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: OPENROUTER_REFRESH_PATH,
				handler: async (req, res) => {
					if (rejectWebRequest(ctx, req, res)) return;
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					try {
						await session.openRouter.syncAuthentication();
						if (!session.openRouter.snapshot().connected) return json(res, 409, { error: "Sign in to OpenRouter first" });
						await session.openRouter.refresh(true);
						json(res, 200, session.openRouter.snapshot());
					} catch {
						json(res, 503, { error: "OpenRouter model catalog unavailable" });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: PI_LOGIN_AUTH_STATUS_PATH,
				handler: async (req, res) => {
					if (rejectWebRequest(ctx, req, res)) return;
					if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
					json(res, 200, await auth.status());
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: PI_LOGIN_AUTH_LOGIN_PATH,
				handler: async (req, res) => {
					if (rejectWebRequest(ctx, req, res)) return;
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					try {
						const challenge = await auth.signIn(providerIdFrom(await readJson(req)));
						if (challenge.kind === "browser") auth.waitUntilSettled(challenge.provider).then(async () => {
							await notifyAuthChanged();
						});
						json(res, 200, challenge);
					} catch (error) {
						json(res, 500, { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: PI_LOGIN_AUTH_CANCEL_PATH,
				handler: async (req, res) => {
					if (rejectWebRequest(ctx, req, res)) return;
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					try {
						await auth.cancel(providerIdFrom(await readJson(req)));
						json(res, 200, { ok: true });
					} catch (error) {
						json(res, 500, { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: PI_LOGIN_AUTH_COMPLETE_PATH,
				handler: async (req, res) => {
					if (rejectWebRequest(ctx, req, res)) return;
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					try {
						const submission = providerInputFrom(await readJson(req));
						const account = await auth.submitInput(submission.providerId, submission.value);
						await notifyAuthChanged();
						json(res, 200, {
							ok: true,
							account
						});
					} catch (error) {
						json(res, 500, { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: PI_LOGIN_AUTH_LOGOUT_PATH,
				handler: async (req, res) => {
					if (rejectWebRequest(ctx, req, res)) return;
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					try {
						await auth.signOut(providerIdFrom(await readJson(req)));
						await notifyAuthChanged();
						json(res, 200, { ok: true });
					} catch (error) {
						json(res, 500, { error: safeMessage(error) });
					}
				}
			})
		];
		return async () => {
			for (const dispose of routes) dispose();
			await auth.dispose();
		};
	}, "dsh-oauth-login: Web OAuth routes");
}
//#endregion
//#region src/oauth-refresh.ts
/**
* When to spend a refresh_token. Chat already refreshes via Models.getAuth;
* this helper is for status / boot / the host timer so the store does not sit
* on a stale expires stamp.
*/
/** Refresh when the stored access stamp is inside this window (Pi already skews expires by 5 min). */
const OAUTH_REFRESH_SOON_MS = 9e5;
/** Host timer. Access lives ~6h; this is just how often we look. */
const OAUTH_REFRESH_POLL_MS = 9e5;
const lastAttempt = /* @__PURE__ */ new Map();
function grantNeedsRefresh(expires, now = Date.now()) {
	return now >= expires - OAUTH_REFRESH_SOON_MS;
}
function refreshAttemptKey(storeId, providerId) {
	return `${storeId}\0${providerId}`;
}
function refreshOnCooldown(key, now = Date.now()) {
	const previous = lastAttempt.get(key);
	return previous !== void 0 && now - previous < 3e5;
}
function markRefreshAttempt(key, now = Date.now()) {
	lastAttempt.set(key, now);
}
async function refreshGrant(getAuth, providerId) {
	try {
		await getAuth(providerId);
		return "ok";
	} catch {
		return "failed";
	}
}
//#endregion
//#region src/openrouter-catalog.ts
/** One Host-owned cache/refresh loop. It never receives an OAuth token. */
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CACHE_FILENAME = ".dsh-oauth-openrouter-models.json";
const MAX_BYTES = 12582912;
const FETCH_TIMEOUT_MS = 15e3;
var OpenRouterCatalog = class {
	options;
	entries;
	protectedIds;
	connected = false;
	disposed = false;
	source = "builtin";
	lastUpdatedAt = null;
	lastAttemptAt = null;
	nextRefreshAt = null;
	error = null;
	hydration;
	pending;
	controller;
	timer;
	generation = 0;
	listeners = /* @__PURE__ */ new Set();
	now;
	constructor(options) {
		this.options = options;
		this.now = options.now ?? Date.now;
		this.protectedIds = new Set(options.initiallyProtectedIds ?? []);
	}
	models() {
		return this.entries;
	}
	model(id) {
		return this.entries?.find((model) => model.id === id);
	}
	protects(id) {
		return id.endsWith(":free") || id === "openrouter/free" || this.protectedIds.has(id);
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	changed() {
		for (const listener of this.listeners) try {
			listener();
		} catch {}
	}
	snapshot() {
		return {
			version: 1,
			connected: this.connected,
			refreshing: this.pending !== void 0,
			source: this.source,
			lastUpdatedAt: this.lastUpdatedAt,
			lastAttemptAt: this.lastAttemptAt,
			nextRefreshAt: this.nextRefreshAt,
			retryAt: this.lastAttemptAt === null ? null : this.lastAttemptAt + OPENROUTER_COOLDOWN_MS,
			stale: this.error !== null || this.lastUpdatedAt === null || this.now() - this.lastUpdatedAt >= 9e5,
			error: this.error,
			models: this.connected ? (this.entries ?? []).map((model) => ({
				...model,
				freeOnly: this.protects(model.id)
			})) : []
		};
	}
	hydrate() {
		this.hydration ??= this.readCache();
		return this.hydration;
	}
	async readCache() {
		try {
			if ((await stat(this.options.filename)).size > MAX_BYTES) throw new Error("cache too large");
			const raw = objectValue(JSON.parse(await readFile(this.options.filename, "utf8")));
			if (raw?.version !== 1 || typeof raw.lastUpdatedAt !== "number" || !Number.isFinite(raw.lastUpdatedAt) || raw.lastUpdatedAt <= 0 || raw.lastUpdatedAt > this.now() + 6e4) throw new Error("invalid cache");
			const entries = normalizeOpenRouterModels(raw.data);
			if (this.disposed) return;
			this.entries = entries;
			this.lastUpdatedAt = raw.lastUpdatedAt;
			this.source = "cache";
			if (Array.isArray(raw.protectedIds)) {
				for (const id of raw.protectedIds) if (validModelId(id)) this.protectedIds.add(id);
			}
			this.rememberFree(entries);
			this.changed();
		} catch (error) {
			if (error?.code !== "ENOENT") this.error = "cache";
		}
	}
	rememberFree(entries) {
		for (const model of entries) if (model.priceStatus === "free") this.protectedIds.add(model.id);
	}
	/** Startup reads disk first; only a newly completed login forces a refresh. */
	async syncAuthentication(reason = "check") {
		await this.hydrate();
		const generation = this.generation;
		const authenticated = await this.options.isAuthenticated();
		if (this.disposed || generation !== this.generation) return;
		if (!authenticated) {
			this.disconnect();
			return;
		}
		this.connected = true;
		if (reason === "login" || this.snapshot().stale) this.refresh(reason === "login");
		else if (this.timer === void 0 && this.pending === void 0) this.schedule(Math.max(1, OPENROUTER_REFRESH_MS - (this.now() - this.lastUpdatedAt)));
	}
	/** Coalesced across routes/windows; even forced refreshes honor 60s cooldown. */
	refresh(force = false) {
		if (this.pending !== void 0) return this.pending;
		if (!this.connected || this.disposed) return Promise.resolve();
		if (!force && !this.snapshot().stale) return Promise.resolve();
		if (this.lastAttemptAt !== null && this.now() - this.lastAttemptAt < 6e4) return Promise.resolve();
		const generation = this.generation;
		this.lastAttemptAt = this.now();
		this.controller = new AbortController();
		const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]);
		const pending = this.fetchCatalog(signal, generation).finally(() => {
			if (this.pending !== pending) return;
			this.pending = void 0;
			this.controller = void 0;
			if (this.connected && !this.disposed) this.schedule(OPENROUTER_REFRESH_MS);
		});
		this.pending = pending;
		return pending;
	}
	async fetchCatalog(signal, generation) {
		try {
			if (!await this.options.isAuthenticated()) {
				this.disconnect();
				return;
			}
			await this.options.beforeFetch?.();
			signal.throwIfAborted();
			const response = await (this.options.fetch ?? globalThis.fetch)(OPENROUTER_MODELS_URL, {
				method: "GET",
				headers: { accept: "application/json" },
				signal,
				redirect: "error",
				credentials: "omit"
			});
			if (!response.ok || response.body === null) throw new Error("catalog unavailable");
			const reader = response.body.getReader();
			const chunks = [];
			let size = 0;
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					size += value.byteLength;
					if (size > MAX_BYTES) throw new Error("catalog too large");
					chunks.push(value);
				}
			} finally {
				await reader.cancel().catch(() => void 0);
				reader.releaseLock();
			}
			const raw = objectValue(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			const links = objectValue(raw?.links);
			if (raw === void 0 || links?.next != null || !Array.isArray(raw.data) || typeof raw.total_count === "number" && raw.total_count > raw.data.length) throw new Error("partial catalog");
			const entries = normalizeOpenRouterModels(raw.data);
			if (this.disposed || !this.connected || generation !== this.generation || signal.aborted) return;
			const fetchedAt = this.now();
			const protectedIds = new Set(this.protectedIds);
			for (const model of entries) if (model.priceStatus === "free") protectedIds.add(model.id);
			try {
				await withFileLock(this.options.filename, async () => {
					try {
						const cached = objectValue(JSON.parse(await readFile(this.options.filename, "utf8")));
						if (Array.isArray(cached?.protectedIds)) {
							for (const id of cached.protectedIds) if (validModelId(id)) protectedIds.add(id);
						}
					} catch {}
					await writeFileAtomic(this.options.filename, JSON.stringify({
						version: 1,
						lastUpdatedAt: fetchedAt,
						protectedIds: [...protectedIds],
						data: raw.data
					}) + "\n", {
						mode: 384,
						dirMode: 448
					});
				});
			} catch {
				this.error = "save";
				return;
			}
			if (this.disposed || !this.connected || generation !== this.generation || signal.aborted) return;
			this.entries = entries;
			this.protectedIds = protectedIds;
			this.lastUpdatedAt = fetchedAt;
			this.source = "live";
			this.error = null;
			this.changed();
		} catch {
			if (!this.disposed && this.connected && generation === this.generation) this.error = "fetch";
		}
	}
	schedule(delay) {
		clearTimeout(this.timer);
		this.nextRefreshAt = this.now() + delay;
		this.timer = setTimeout(() => {
			this.timer = void 0;
			this.nextRefreshAt = null;
			this.syncAuthentication().then(() => this.refresh()).catch(() => {
				if (this.connected && !this.disposed) this.schedule(OPENROUTER_REFRESH_MS);
			});
		}, delay);
		this.timer.unref?.();
	}
	disconnect() {
		this.generation += 1;
		this.connected = false;
		clearTimeout(this.timer);
		this.timer = void 0;
		this.nextRefreshAt = null;
		this.controller?.abort();
		this.controller = void 0;
		this.pending = void 0;
	}
	dispose() {
		this.disposed = true;
		this.disconnect();
		this.listeners.clear();
	}
};
//#endregion
//#region src/session.ts
/** Shared OAuth store + catalog for the host plugin and CLI. */
var PiLoginSession = class {
	store;
	models;
	native;
	openRouter;
	proxy;
	constructor(store = new PiLoginCredentialStore(), native = DEFAULT_NATIVE_TOOL_POLICY, catalogOptions = {}, proxyDiscovery = {}) {
		this.store = store;
		this.native = native;
		this.proxy = new OAuthProxyTransport(join(dirname(store.filename), PROXY_SETTINGS_FILENAME), proxyDiscovery);
		this.models = createModels({ credentials: store });
		for (const provider of allCatalogProviders()) this.models.setProvider(provider);
		this.openRouter = new OpenRouterCatalog({
			filename: join(dirname(store.filename), OPENROUTER_CACHE_FILENAME),
			isAuthenticated: async () => (await store.list()).some((item) => item.providerId === "openrouter"),
			beforeFetch: () => this.ensureTransport(),
			fetch: (input, init) => this.proxy.run(() => fetch(input, init)),
			initiallyProtectedIds: harnessModels(this.spec("openrouter")).filter((model) => model.cost.input === 0 && model.cost.output === 0).map((model) => model.id),
			...catalogOptions
		});
	}
	ensureTransport() {
		return this.proxy.initialize();
	}
	spec(id) {
		const spec = piLoginProvider(id);
		if (spec === void 0) throw new Error(`dsh-oauth-login: unknown provider "${id}"`);
		return spec;
	}
	provider(id) {
		return harnessProvider(this.spec(id), this.native, this.openRouter);
	}
	visibleModels(id) {
		return this.provider(id).getModels();
	}
	/**
	* Harness routes that currently hold a stored OAuth grant.
	* Model pickers should only advertise these — logging out must drop the route.
	*/
	async authenticatedRoutes() {
		const signedIn = new Set((await this.store.list()).map((item) => item.providerId));
		return PI_LOGIN_PROVIDERS.filter((provider) => signedIn.has(provider.id)).map((provider) => provider.route);
	}
	async logout(id) {
		await this.store.delete(id);
		if (id === "openrouter") this.openRouter.disconnect();
	}
	/**
	* Renew access tokens that are expired or close to expiry.
	* Failures stay in the store; the next poll or chat retries.
	*/
	async refreshStoredGrants(now = Date.now()) {
		await this.ensureTransport();
		for (const { providerId } of await this.store.list()) {
			const credential = await this.store.read(providerId);
			if (credential?.type !== "oauth" || !grantNeedsRefresh(credential.expires, now)) continue;
			const key = refreshAttemptKey(this.store.filename, providerId);
			if (refreshOnCooldown(key, now)) continue;
			markRefreshAttempt(key, now);
			await this.proxy.run(() => refreshGrant((id) => this.models.getAuth(id), providerId));
		}
	}
};
//#endregion
//#region src/plugin-config.ts
/** Provider-owned knobs published on the `llm-oauth-login` row. */
const Config = z.object({
	streamIdleTimeoutMs: z.number().min(1).default(PI_LOGIN_STREAM_IDLE_TIMEOUT_MS),
	retryPolicy: RetryPolicySchema,
	nativeTools: z.boolean().default(true),
	nativeImage: z.boolean().default(true)
});
//#endregion
//#region src/index.ts
const name = "llm-oauth-login";
const inject = ["llm"];
/**
* Publish only the routes that currently hold a plugin-owned credential.
* Logging out must drop that route from the model picker immediately.
*/
async function syncAuthenticatedRoutes(session, registration) {
	registration.replace(await session.authenticatedRoutes());
}
function apply(ctx, config) {
	console.log("[my-plugins/dsh-oauth-login] loaded");
	const native = {
		enabled: config.nativeTools !== false,
		image: config.nativeImage !== false
	};
	const session = new PiLoginSession(new PiLoginCredentialStore(), native);
	const registration = ctx.llm.registerAdapter(piLoginRoutes(), createPiLoginAdapter(session, () => ctx.get("attachments"), {
		streamIdleTimeoutMs: config.streamIdleTimeoutMs,
		retryPolicy: config.retryPolicy
	}));
	const refreshRoutes = () => syncAuthenticatedRoutes(session, registration);
	refreshRoutes();
	ctx.effect(() => {
		const stop = session.openRouter.subscribe(() => {
			refreshRoutes().catch(() => {});
		});
		session.openRouter.syncAuthentication().catch(() => {
			console.warn("[dsh-oauth-login] OpenRouter catalog initialization failed; keeping built-in models");
		});
		return async () => {
			stop();
			session.openRouter.dispose();
			await session.proxy.dispose();
		};
	}, "dsh-oauth-login: OpenRouter catalog");
	ctx.effect(() => {
		const timer = setInterval(() => {
			session.refreshStoredGrants().catch(() => {});
		}, OAUTH_REFRESH_POLL_MS);
		session.refreshStoredGrants().catch(() => {});
		return () => clearInterval(timer);
	}, "dsh-oauth-login: refresh oauth grants");
	ctx.inject(["webServer", "connection"], (webCtx) => {
		registerPiLoginAuthRoutes(webCtx, session, { onAuthChanged: refreshRoutes });
	});
	ctx.inject(["systemPrompt"], (promptCtx) => {
		promptCtx.on("system-prompt/assemble", async (_assembly, context, next) => {
			const assembled = await next();
			const route = context.agent?.options?.provider;
			const modelId = context.agent?.options?.model;
			const spec = route === void 0 ? void 0 : piLoginProviderByRoute(route);
			const plan = nativePlanForRoute(route, spec === void 0 || modelId === void 0 ? void 0 : session.visibleModels(spec.id).find((model) => model.id === modelId)?.api, session.native);
			return plan === void 0 ? assembled : maskDshWebAssembly(assembled, plan);
		});
	});
}
//#endregion
export { Config, DEFAULT_NATIVE_TOOL_POLICY, LEGACY_PI_LOGIN_AUTH_FILENAME, OAUTH_REFRESH_POLL_MS, OAUTH_REFRESH_SOON_MS, OX_ALPHA_DEFAULT_EFFORT, OX_ALPHA_MODEL_ID, PI_LOGIN_AUTH_CANCEL_PATH, PI_LOGIN_AUTH_COMPLETE_PATH, PI_LOGIN_AUTH_FILENAME, PI_LOGIN_AUTH_LOGIN_PATH, PI_LOGIN_AUTH_LOGOUT_PATH, PI_LOGIN_AUTH_STATUS_PATH, PI_LOGIN_BOOT_MARKER, PI_LOGIN_PROVIDERS, PI_LOGIN_ROUTE_PREFIX, PI_LOGIN_STREAM_IDLE_TIMEOUT_MS, PiLoginCredentialStore, PiLoginSession, QUOTA_HINT, RATE_LIMIT_HINT, TRANSIENT_HINT, TRANSIENT_MODEL_CODES, apply, applyNativeToolsToPayload, catalogProvider, collectHostedImagesFromEvent, createPiLoginAdapter, decodeHostedImage, defaultReasoningEffortFor, extraModelsFor, filterHostedServerToolTraces, filterXaiServerToolTraces, grantNeedsRefresh, harnessModels, harnessProvider, hintFailure, hintForCode, inject, injectHostedImages, isHostedSearchReasoningReplay, isHostedServerToolCall, isSafeAuthUrl, isXaiServerXSearchCall, loginPiProvider, loginPiProviderSession, logoutPiProvider, name, nativePlan, nativePlanForRoute, piLoginAuthPath, piLoginProvider, piLoginRoutes, piLoginStatus, preferredModel, prepareNativeToolRequest, registerPiLoginAuthRoutes, safeMessage, sniffImageMediaType, stripAssistantImages, withModelErrorHint };
