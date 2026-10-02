import { LlmFailure, RequestMessage, RetryPolicyConfig, StreamChunk } from "@deepseek-ai/dsh-llm";
import { Api, AuthInteraction, AuthOperationOptions, Context, Credential, CredentialInfo, CredentialStore, Model, MutableModels, Provider, StreamOptions } from "@earendil-works/pi-ai";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { AsyncLocalStorage } from "node:async_hooks";
import { EnvHttpProxyAgent } from "undici";
import z from "@deepseek-ai/schemastery";
import { Context as Context$1 } from "@deepseek-ai/cordis";
import { AttachmentStore, ImageAttachmentRef, ImageMediaType, SaveImageAttachment } from "@deepseek-ai/dsh-attachment";
//#region src/plugin-config.d.ts
/**
 * `retryPolicy` is executed by shipped `dsh-llm-retry`, not by this plugin.
 * Omission keeps the RC8 official normal default (5 retries for TIMEOUT /
 * TRANSPORT / SERVER / RATE_LIMIT / EMPTY_RESPONSE).
 */
interface Config {
  streamIdleTimeoutMs?: number;
  retryPolicy?: RetryPolicyConfig;
  /**
   * Hide DSH web_search / web_fetch on OAuth routes that already have hosted
   * search, and attach those hosted tools to the provider request.
   */
  nativeTools?: boolean;
  /** Also attach hosted image generation on Grok and Codex. */
  nativeImage?: boolean;
}
declare const Config: z<Config>;
//#endregion
//#region src/catalog.d.ts
/** OAuth subscriptions Pi Agent exposes via /login. Radius is omitted (needs a gateway). */
interface PiLoginProvider {
  /** pi-ai provider id used by models.login(). */
  readonly id: string;
  /** Harness LLM route. Distinct from catalog routes and from other plugins. */
  readonly route: string;
  /** Credential method this plugin deliberately exposes for this provider. */
  readonly authType: 'oauth' | 'api_key';
  /** Official account page opened before an interactive API-key prompt. */
  readonly loginUrl?: string;
  readonly displayName: string;
  readonly shortName: string;
  readonly blurb: string;
  readonly blurbZh: string;
  /** HTTPS hosts this provider is allowed to open during login. */
  readonly allowedHosts: readonly string[];
  /** Extra allowed host suffixes (leading-dot match). */
  readonly allowedSuffixes: readonly string[];
  readonly preferredModels: readonly string[];
}
declare const PI_LOGIN_PROVIDERS: readonly PiLoginProvider[];
declare function piLoginProvider(id: string): PiLoginProvider | undefined;
declare function piLoginRoutes(): string[];
//#endregion
//#region src/http.d.ts
type OAuthProxyResolution = {
  source: 'environment';
} | {
  source: 'explicit' | 'system' | 'loopback';
  proxyUrl: string;
} | {
  source: 'direct';
};
interface OAuthProxyDiscoveryOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  readSystemProxy?: () => Promise<string | undefined>;
  probe?: (proxyUrl: string) => Promise<boolean>;
  candidates?: readonly string[];
}
//#endregion
//#region src/proxy-config.d.ts
interface ProxyChannelSettings {
  /** False means direct, even when proxy environment variables are set. */
  enabled: boolean;
  /** Empty keeps environment/system discovery; otherwise this URL wins. */
  url: string;
}
interface ProxySettings {
  http: ProxyChannelSettings;
  websocket: ProxyChannelSettings;
}
interface ProxySettingsSnapshot extends ProxySettings {
  revision: number;
}
//#endregion
//#region src/proxy-store.d.ts
declare class ProxySettingsStore {
  readonly filename: string;
  constructor(filename: string);
  read(): Promise<ProxySettingsSnapshot>;
  save(value: unknown): Promise<ProxySettingsSnapshot>;
}
//#endregion
//#region src/proxy-transport.d.ts
declare class OAuthProxyTransport {
  private readonly discovery;
  readonly settings: ProxySettingsStore;
  private readyPromise?;
  private readonly generations;
  private readonly sessions;
  private disposed;
  constructor(filename: string, discovery?: OAuthProxyDiscoveryOptions);
  private build;
  private ready;
  initialize(): Promise<OAuthProxyResolution>;
  private acquire;
  save(value: unknown): Promise<ProxySettingsSnapshot>;
  private release;
  run<T>(operation: () => Promise<T>): Promise<T>;
  private beginSession;
  iterate<T>(source: AsyncIterable<T>, codexSessionId?: string): AsyncIterable<T>;
  dispose(): Promise<void>;
}
//#endregion
//#region src/native-tools.d.ts
interface NativeToolPolicy {
  /** Attach hosted tools and hide DSH web_search / web_fetch. Default true. */
  enabled: boolean;
  /** Also attach hosted image generation where the provider documents it. Default true. */
  image: boolean;
}
declare const DEFAULT_NATIVE_TOOL_POLICY: NativeToolPolicy;
interface NativeToolPlan {
  readonly providerId: string;
  readonly api: string;
  readonly hosted: readonly Record<string, unknown>[];
  readonly guidance: string;
}
declare function nativePlan(providerId: string, api: string | undefined, policy?: NativeToolPolicy): NativeToolPlan | undefined;
declare function nativePlanForRoute(route: string | undefined, api: string | undefined, policy?: NativeToolPolicy): NativeToolPlan | undefined;
/**
 * xAI's Responses stream currently exposes server-executed X Search details
 * as custom tool calls. The outer `xs_call-*` id distinguishes those traces
 * from a same-named client function, which Harness must still execute.
 */
declare function isXaiServerXSearchCall(block: unknown): boolean;
/**
 * Server-executed hosted search / image traces that Harness must not try to run.
 * X Search leaks use `xs_call-*`. DSH `web_search` / `web_fetch` were stripped
 * from this route, so a leftover same-named call is also a leak.
 */
declare function isHostedServerToolCall(block: unknown): boolean;
/**
 * xAI hosted search hops arrive as empty `reasoning` blocks whose signature
 * id is `tco_<response>_call-…`. The UI renders each as a blank Think card.
 */
declare function isHostedSearchReasoningReplay(block: unknown): boolean;
/**
 * Remove hosted server-side search / image traces after pi-ai 0.82.1 has
 * mistaken them for client function calls. Other blocks retain stream order,
 * actual client tools survive, and pi-ai replay metadata stays index-aligned.
 */
declare function filterHostedServerToolTraces(source: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk>;
/** @deprecated Use {@link filterHostedServerToolTraces}. */
declare const filterXaiServerToolTraces: typeof filterHostedServerToolTraces;
declare function applyNativeToolsToPayload(payload: unknown, providerId: string, api: string | undefined, policy?: NativeToolPolicy): unknown;
/**
 * Prepare one provider request as a single unit.
 *
 * Native tools are a property of this request, not of the provider account.
 * A context without tools is a text-only call (reviewers, summaries, titles,
 * and similar utility traffic), so its payload hook must stay untouched even
 * when the provider serializer later emits `tools: []`.
 */
declare function prepareNativeToolRequest<TOptions extends StreamOptions>(context: Context, options: TOptions, providerId: string, api: string | undefined, policy?: NativeToolPolicy): {
  context: Context;
  options: TOptions & StreamOptions;
};
//#endregion
//#region src/store.d.ts
declare function piLoginAuthPath(dshHome?: string): string;
declare class PiLoginCredentialStore implements CredentialStore {
  readonly filename: string;
  readonly legacyFilename: string | undefined;
  constructor(filename?: string);
  private readDocument;
  read(providerId: string, options?: AuthOperationOptions): Promise<Credential | undefined>;
  list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]>;
  modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>, options?: AuthOperationOptions): Promise<Credential | undefined>;
  delete(providerId: string, options?: AuthOperationOptions): Promise<void>;
}
//#endregion
//#region src/openrouter-types.d.ts
interface OpenRouterModel {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  inputModalities: string[];
  outputModalities: string[];
  supportedParameters: string[];
  tools: boolean;
  reasoning: boolean;
  reasoningMandatory: boolean;
  supportedEfforts?: string[];
  defaultEffort?: string;
  /** USD per token/unit as supplied by the official catalog, not pi-ai costs. */
  pricing: Record<string, string>;
  priceStatus: 'free' | 'paid' | 'unknown';
  /** Endpoint deprecation, NEVER interpreted as a promotion deadline. */
  deprecatesAt?: string;
}
interface OpenRouterCatalogSnapshot {
  version: 1;
  connected: boolean;
  refreshing: boolean;
  source: 'builtin' | 'cache' | 'live';
  lastUpdatedAt: number | null;
  lastAttemptAt: number | null;
  nextRefreshAt: number | null;
  retryAt: number | null;
  stale: boolean;
  error: 'fetch' | 'cache' | 'save' | null;
  models: Array<OpenRouterModel & {
    freeOnly: boolean;
  }>;
}
//#endregion
//#region src/openrouter-catalog.d.ts
interface OpenRouterCatalogOptions {
  filename: string;
  isAuthenticated: () => Promise<boolean>;
  beforeFetch?: () => Promise<unknown>;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  /** Protect zero-cost legacy selections too, without labelling them free. */
  initiallyProtectedIds?: readonly string[];
}
declare class OpenRouterCatalog {
  private readonly options;
  private entries;
  private protectedIds;
  private connected;
  private disposed;
  private source;
  private lastUpdatedAt;
  private lastAttemptAt;
  private nextRefreshAt;
  private error;
  private hydration;
  private pending;
  private controller;
  private timer;
  private generation;
  private readonly listeners;
  private readonly now;
  constructor(options: OpenRouterCatalogOptions);
  models(): readonly OpenRouterModel[] | undefined;
  model(id: string): OpenRouterModel | undefined;
  protects(id: string): boolean;
  subscribe(listener: () => void): () => void;
  private changed;
  snapshot(): OpenRouterCatalogSnapshot;
  private hydrate;
  private readCache;
  private rememberFree;
  /** Startup reads disk first; only a newly completed login forces a refresh. */
  syncAuthentication(reason?: 'check' | 'login'): Promise<void>;
  /** Coalesced across routes/windows; even forced refreshes honor 60s cooldown. */
  refresh(force?: boolean): Promise<void>;
  private fetchCatalog;
  private schedule;
  disconnect(): void;
  dispose(): void;
}
//#endregion
//#region src/session.d.ts
declare class PiLoginSession {
  readonly store: PiLoginCredentialStore;
  readonly models: MutableModels;
  readonly native: NativeToolPolicy;
  readonly openRouter: OpenRouterCatalog;
  readonly proxy: OAuthProxyTransport;
  constructor(store?: PiLoginCredentialStore, native?: NativeToolPolicy, catalogOptions?: Partial<Pick<OpenRouterCatalogOptions, 'fetch' | 'now' | 'filename'>>, proxyDiscovery?: OAuthProxyDiscoveryOptions);
  ensureTransport(): Promise<OAuthProxyResolution>;
  spec(id: string): PiLoginProvider;
  provider(id: string): import("@earendil-works/pi-ai").Provider<import("@earendil-works/pi-ai").Api>;
  visibleModels(id: string): readonly import("@earendil-works/pi-ai").Model<import("@earendil-works/pi-ai").Api>[];
  /**
   * Harness routes that currently hold a stored OAuth grant.
   * Model pickers should only advertise these — logging out must drop the route.
   */
  authenticatedRoutes(): Promise<string[]>;
  logout(id: string): Promise<void>;
  /**
   * Renew access tokens that are expired or close to expiry.
   * Failures stay in the store; the next poll or chat retries.
   */
  refreshStoredGrants(now?: number): Promise<void>;
}
//#endregion
//#region src/adapter.d.ts
interface PiLoginAdapterOptions {
  streamIdleTimeoutMs?: number;
  retryPolicy?: RetryPolicyConfig;
}
declare function createPiLoginAdapter(session: PiLoginSession, resolveAttachments: () => AttachmentStore | undefined, options?: PiLoginAdapterOptions): PiAiAdapter;
//#endregion
//#region src/auth.d.ts
interface PiLoginAuthStatus {
  providerId: string;
  authenticated: boolean;
  credentialType?: 'oauth' | 'api_key';
  expiresAt?: Date;
}
declare function loginPiProvider(providerId: string, interaction: AuthInteraction, store?: PiLoginCredentialStore): Promise<void>;
declare function logoutPiProvider(providerId: string, store?: PiLoginCredentialStore): Promise<void>;
declare function piLoginStatus(store?: PiLoginCredentialStore, providerId?: string): Promise<PiLoginAuthStatus[]>;
declare function loginPiProviderSession(providerId: string, interaction: AuthInteraction, session: PiLoginSession): Promise<void>;
//#endregion
//#region src/auth-routes.d.ts
declare const PI_LOGIN_AUTH_STATUS_PATH = "/plugins/dsh-oauth-login/auth/status";
declare const PI_LOGIN_AUTH_LOGIN_PATH = "/plugins/dsh-oauth-login/auth/login";
declare const PI_LOGIN_AUTH_CANCEL_PATH = "/plugins/dsh-oauth-login/auth/cancel";
declare const PI_LOGIN_AUTH_COMPLETE_PATH = "/plugins/dsh-oauth-login/auth/complete";
declare const PI_LOGIN_AUTH_LOGOUT_PATH = "/plugins/dsh-oauth-login/auth/logout";
interface LoginInputChallenge {
  type: 'secret' | 'text' | 'manual_code';
  message: string;
  placeholder?: string;
}
type PiLoginAccountState = {
  status: 'signed-out';
} | {
  status: 'signing-in';
  kind?: 'browser' | 'input';
  url?: string;
  userCode?: string;
  input?: LoginInputChallenge;
} | {
  status: 'signed-in';
  models: string[];
  expiresAt?: string;
} | {
  status: 'error';
  message: string;
};
interface PiLoginProviderStatus {
  id: string;
  route: string;
  displayName: string;
  shortName: string;
  authType: PiLoginProvider['authType'];
  account: PiLoginAccountState;
}
interface LoginChallenge {
  provider: string;
  kind: 'browser' | 'input';
  url?: string;
  userCode?: string;
  input?: LoginInputChallenge;
}
interface PiLoginAuthRouteOptions {
  /** Called after a successful sign-in or sign-out so the host can refresh LLM routes. */
  onAuthChanged?: () => void | Promise<void>;
}
declare function registerPiLoginAuthRoutes(ctx: Context$1, session: PiLoginSession, options?: PiLoginAuthRouteOptions): void;
//#endregion
//#region src/extra-models.d.ts
declare const GLM_5_3_DEFAULT_EFFORT = "max";
declare const GLM_5_3_FLASH_DEFAULT_EFFORT = "max";
/** OpenRouter stealth model missing from the installed pi-ai catalog (0.82.x–0.84.x). */
declare const OX_ALPHA_MODEL_ID = "stealth/ox-alpha";
/**
 * OpenRouter's live default for ox-alpha (`reasoning.default_effort`).
 * Must be sent explicitly: pi-ai's OpenRouter dialect writes
 * `reasoning: { effort: thinkingLevelMap.off ?? "none" }` when the caller
 * omits an effort, and ox-alpha rejects `none` (`reasoning.mandatory: true`).
 */
declare const OX_ALPHA_DEFAULT_EFFORT = "max";
/** Per-model default the selector and request path should apply when omitted. */
declare function defaultReasoningEffortFor(modelId: string): typeof OX_ALPHA_DEFAULT_EFFORT | typeof GLM_5_3_DEFAULT_EFFORT | typeof GLM_5_3_FLASH_DEFAULT_EFFORT | 'medium' | undefined;
/**
 * Extra models this plugin publishes for one pi-ai provider id.
 * @param providerId - catalog provider id (e.g. `xai`), not the harness route.
 */
declare function extraModelsFor(providerId: string): readonly Model<Api>[];
//#endregion
//#region src/hosted-capture.d.ts
interface HostedImage {
  id?: string;
  base64: string;
}
interface HostedCapture {
  images: HostedImage[];
}
//#endregion
//#region src/hosted-images.d.ts
declare function sniffImageMediaType(bytes: Uint8Array): ImageMediaType | undefined;
declare function collectHostedImagesFromEvent(event: unknown, into: HostedImage[]): void;
declare function decodeHostedImage(base64: string): {
  data: Uint8Array;
  mediaType: ImageMediaType;
} | undefined;
/**
 * pi-ai replay cannot represent assistant ImageBlocks. Drop them before the
 * next request so replay metadata still lines up with remaining content.
 */
declare function stripAssistantImages(messages: readonly RequestMessage[]): RequestMessage[];
declare function injectHostedImages(source: AsyncIterable<StreamChunk>, capture: HostedCapture, save: (input: SaveImageAttachment) => Promise<ImageAttachmentRef>): AsyncGenerator<StreamChunk>;
//#endregion
//#region src/oauth-refresh.d.ts
/**
 * When to spend a refresh_token. Chat already refreshes via Models.getAuth;
 * this helper is for status / boot / the host timer so the store does not sit
 * on a stale expires stamp.
 */
/** Refresh when the stored access stamp is inside this window (Pi already skews expires by 5 min). */
declare const OAUTH_REFRESH_SOON_MS: number;
/** Host timer. Access lives ~6h; this is just how often we look. */
declare const OAUTH_REFRESH_POLL_MS: number;
declare function grantNeedsRefresh(expires: number, now?: number): boolean;
//#endregion
//#region src/ids.d.ts
/** Basename of the DSH-owned multi-provider OAuth document. */
declare const PI_LOGIN_AUTH_FILENAME = ".dsh-oauth-auth.json";
/** Legacy DSH filename accepted during the one-time storage migration. */
declare const LEGACY_PI_LOGIN_AUTH_FILENAME = ".pi-login-auth.json";
/** Prefix for harness routes so they never collide with catalog / other plugins. */
declare const PI_LOGIN_ROUTE_PREFIX = "pi-";
/** Provider idle ceiling used by every composite route. */
declare const PI_LOGIN_STREAM_IDLE_TIMEOUT_MS = 300000;
/** Startup line `dshx verify` looks for. */
declare const PI_LOGIN_BOOT_MARKER = "[my-plugins/dsh-oauth-login] loaded";
//#endregion
//#region src/model-error-hint.d.ts
/**
 * Default Harness `retryPolicy` codes. Keep aligned with
 * `resolveRetryPolicy(undefined)` in `@deepseek-ai/dsh-llm`.
 */
declare const TRANSIENT_MODEL_CODES: readonly string[];
declare const QUOTA_HINT = "This is account quota or credits, not a temporary busy signal. Automatic retry will not refill it. Check the plan, usage window, or balance.";
declare const RATE_LIMIT_HINT = "This is a request-rate or peak-busy limit. A 429 is often this, not an empty balance. After automatic retries end, wait and send another message. If Continue fails or the composer stays stuck, start a new chat.";
declare const TRANSIENT_HINT = "After this turn ends, send another message to try again. If Continue fails or the composer stays stuck, start a new chat.";
/** Stable Chat copy for one official `LlmError` code. Does not invent 5h vs weekly vs billing. */
declare function hintForCode(code: string): string | undefined;
/** Normalize known provider gaps before the official retry executor receives this failure. */
declare function hintFailure(failure: LlmFailure, provider?: string): LlmFailure;
/** Apply the same provider correction and hint to thrown failures, preserving diagnostics. */
declare function withModelErrorHint(error: unknown, provider?: string): unknown;
//#endregion
//#region src/provider.d.ts
declare function catalogProvider(id: string): Provider;
declare function harnessModels(spec: PiLoginProvider, catalog?: OpenRouterCatalog): Model<Api>[];
declare function preferredModel(spec: PiLoginProvider, models?: readonly {
  id: string;
}[]): string;
declare function harnessProvider(spec: PiLoginProvider, native?: NativeToolPolicy, catalog?: OpenRouterCatalog): Provider;
//#endregion
//#region src/redact.d.ts
/** Remove token-like strings from an external OAuth diagnostic. */
declare function safeMessage(error: unknown): string;
/** Only this provider's official HTTPS hosts may be opened for login. */
declare function isSafeAuthUrl(raw: string, provider: PiLoginProvider): boolean;
//#endregion
//#region src/index.d.ts
type NativeAssembly = {
  tools: {
    name: string;
  }[];
  sections: {
    name: string;
    text: string;
  }[];
};
type NativeAssembleContext = {
  agent?: {
    options?: {
      provider?: string;
      model?: string;
    };
  };
};
declare module '@deepseek-ai/cordis' {
  interface Events {
    'system-prompt/assemble'(assembly: NativeAssembly, context: NativeAssembleContext, next: () => Promise<NativeAssembly>): Promise<NativeAssembly>;
  }
}
declare const name = "llm-oauth-login";
declare const inject: string[];
declare function apply(ctx: Context$1, config: Config): void;
//#endregion
export { Config, type Config as PluginConfig, DEFAULT_NATIVE_TOOL_POLICY, LEGACY_PI_LOGIN_AUTH_FILENAME, type LoginChallenge, type LoginInputChallenge, type NativeToolPlan, type NativeToolPolicy, OAUTH_REFRESH_POLL_MS, OAUTH_REFRESH_SOON_MS, OX_ALPHA_DEFAULT_EFFORT, OX_ALPHA_MODEL_ID, PI_LOGIN_AUTH_CANCEL_PATH, PI_LOGIN_AUTH_COMPLETE_PATH, PI_LOGIN_AUTH_FILENAME, PI_LOGIN_AUTH_LOGIN_PATH, PI_LOGIN_AUTH_LOGOUT_PATH, PI_LOGIN_AUTH_STATUS_PATH, PI_LOGIN_BOOT_MARKER, PI_LOGIN_PROVIDERS, PI_LOGIN_ROUTE_PREFIX, PI_LOGIN_STREAM_IDLE_TIMEOUT_MS, type PiLoginAdapterOptions, type PiLoginAuthStatus, PiLoginCredentialStore, type PiLoginProvider, type PiLoginProviderStatus, PiLoginSession, QUOTA_HINT, RATE_LIMIT_HINT, TRANSIENT_HINT, TRANSIENT_MODEL_CODES, apply, applyNativeToolsToPayload, catalogProvider, collectHostedImagesFromEvent, createPiLoginAdapter, decodeHostedImage, defaultReasoningEffortFor, extraModelsFor, filterHostedServerToolTraces, filterXaiServerToolTraces, grantNeedsRefresh, harnessModels, harnessProvider, hintFailure, hintForCode, inject, injectHostedImages, isHostedSearchReasoningReplay, isHostedServerToolCall, isSafeAuthUrl, isXaiServerXSearchCall, loginPiProvider, loginPiProviderSession, logoutPiProvider, name, nativePlan, nativePlanForRoute, piLoginAuthPath, piLoginProvider, piLoginRoutes, piLoginStatus, preferredModel, prepareNativeToolRequest, registerPiLoginAuthRoutes, safeMessage, sniffImageMediaType, stripAssistantImages, withModelErrorHint };