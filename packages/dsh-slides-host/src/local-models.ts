import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import YAML from "yaml";
import type { ModelInputModality } from "@open-slidestudio/presentation-run";
import {
  assertIsolatedDshHome,
  OAUTH_ISOLATION_FILENAMES,
  userDshHome,
} from "./isolation.js";

export { assertIsolatedDshHome, userDshHome } from "./isolation.js";

export const SLIDES_MODEL_CATALOG_FILENAME = "slides-model-catalog.json";

export type RuntimeModelInfo = {
  readonly name: string;
  readonly inputModalities: readonly ModelInputModality[];
  readonly efforts?: readonly string[];
};
export type RuntimeModelCatalog = ReadonlyMap<string, ReadonlyMap<string, RuntimeModelInfo>>;

type ModelCompatOverride = {
  readonly providerId: string;
  readonly baseURL: string;
  readonly modelId: string;
  readonly compat: Readonly<Record<string, unknown>>;
};

/**
 * Compatibility verified against the exact provider routes used by this
 * product. Keep these overrides model-specific: other models on a shared
 * gateway can support a different message-role contract.
 */
const PROJECT_MODEL_COMPAT_OVERRIDES: readonly ModelCompatOverride[] = [
  {
    providerId: "amd",
    baseURL: "https://developer.amd.com.cn/radeon/api/v1",
    modelId: "Qwen3.8-Flash-Next",
    compat: { supportsDeveloperRole: false },
  },
];

export function isAntigravityId(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (!text) return false;
  return text.includes("antigravity") || text.startsWith("agy-") || text.includes("google-antigravity");
}

export type ImportedProvider = {
  readonly id: string;
  readonly name: string;
  readonly apiKeyEnv?: string;
  readonly models: readonly string[];
  readonly ready: boolean;
  readonly profile?: Record<string, unknown>;
};

export type SlidesModelCatalog = {
  readonly sourceHome: string;
  readonly destHome: string;
  readonly excluded: readonly string[];
  readonly oauthSkipped: readonly string[];
  readonly defaultProvider: string;
  readonly defaultModel: string;
  readonly providers: readonly ImportedProvider[];
};

/**
 * Operator-added providers that must survive every regeneration of the
 * isolated home. Full pi-ai profiles (baseURL, api, models) live here; the
 * key itself is stored through the product (credentials/<id>.key).
 */
export const LOCAL_PROVIDERS_FILENAME = "slides-providers.local.json";

function localProviderExtrasFile(destHome: string): string {
  return path.join(destHome, LOCAL_PROVIDERS_FILENAME);
}

function readLocalProviderExtras(
  destHome: string,
  env: NodeJS.ProcessEnv,
): ImportedProvider[] {
  const file = localProviderExtrasFile(destHome);
  if (!fs.existsSync(file)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : [];
  const out: ImportedProvider[] = [];
  for (const value of list) {
    const profile = asRecord(value);
    if (!profile) continue;
    const id = typeof profile.id === "string" ? profile.id.trim() : "";
    if (!id || isAntigravityId(id) || out.some((row) => row.id === id)) continue;
    const apiKeyEnv = typeof profile.apiKeyEnv === "string" ? profile.apiKeyEnv.trim() : undefined;
    const models = providerModels(profile);
    const keyFile = path.join(destHome, "credentials", `${id}.key`);
    const ready = Boolean(
      (apiKeyEnv && env[apiKeyEnv]?.trim()) ||
      (apiKeyEnv && process.env[apiKeyEnv]?.trim()) ||
      fs.existsSync(keyFile),
    );
    out.push({
      id,
      name: providerName(id, profile),
      apiKeyEnv,
      models,
      ready,
      profile,
    });
  }
  return out;
}

export type ImportLocalDshModelsInput = {
  readonly sourceHome?: string;
  readonly destHome: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly userHomeDir?: string;
};

/**
 * BYOK/local providers must land in two places: `slides-providers.local.json`
 * so they survive the next importLocalDshModels regeneration, and the live
 * settings.yaml llm-pi-ai.providers block so the kernel can resolve the
 * provider id on the very next agent create/resume — not only after re-import.
 */
export type LocalProviderProfile = {
  readonly id: string;
  readonly name?: string;
  readonly apiKeyEnv?: string;
  readonly baseURL: string;
  readonly api?: string;
  readonly models: readonly string[];
};

/**
 * Roster/extras records are human-shaped (`name`, `models: string[]`). The
 * kernel's llm-pi-ai profile schema wants `displayName` and `models: [{id}]`;
 * translate before writing settings.yaml or the import is rejected.
 */
function kernelProviderProfile(profile: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...profile };
  delete out.id;
  if (out.displayName === undefined && typeof out.name === "string") {
    out.displayName = out.name;
    delete out.name;
  }
  if (Array.isArray(out.models)) {
    out.models = out.models.map((row) => (typeof row === "string" ? { id: row } : row));
  }
  return out;
}

function writeKernelProvider(
  destHome: string,
  id: string,
  profile: Record<string, unknown> | undefined,
): void {
  const settingsFile = path.join(destHome, "settings.yaml");
  let settings: Record<string, unknown> = {};
  try {
    settings = asRecord(readYamlFile(settingsFile)) ?? {};
  } catch {
    settings = {};
  }
  const llm = { ...(asRecord(settings["llm-pi-ai"]) ?? {}) };
  const providers = { ...(asRecord(llm.providers) ?? {}) };
  if (profile) providers[id] = kernelProviderProfile(profile);
  else delete providers[id];
  llm.providers = providers;
  settings["llm-pi-ai"] = llm;
  fs.writeFileSync(settingsFile, YAML.stringify(settings));
  chmodOwnerOnlyFile(settingsFile);
}

export function upsertLocalProviderProfile(
  destHome: string,
  input: LocalProviderProfile,
): void {
  const file = localProviderExtrasFile(destHome);
  let extras: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(parsed)) extras = parsed;
  } catch {
    /* unreadable extras file is replaced wholesale */
  }
  const record: Record<string, unknown> = {
    id: input.id,
    name: input.name ?? input.id,
    ...(input.apiKeyEnv ? { apiKeyEnv: input.apiKeyEnv } : {}),
    baseURL: input.baseURL,
    api: input.api ?? "openai-completions",
    models: [...input.models],
  };
  const index = extras.findIndex((row) => asRecord(row)?.id === input.id);
  if (index >= 0) extras[index] = record;
  else extras.push(record);
  fs.mkdirSync(destHome, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(extras, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  writeKernelProvider(destHome, input.id, record);
}

export function removeLocalProviderProfile(destHome: string, id: string): void {
  const file = localProviderExtrasFile(destHome);
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(parsed)) {
      const next = parsed.filter((row) => asRecord(row)?.id !== id);
      fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      fs.chmodSync(file, 0o600);
    }
  } catch {
    /* nothing persisted */
  }
  writeKernelProvider(destHome, id, undefined);
}

export type ImportLocalDshModelsResult = {
  readonly catalog: SlidesModelCatalog;
  readonly envBindings: Record<string, string>;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function readYamlFile(file: string): unknown {
  if (!fs.existsSync(file)) return undefined;
  return YAML.parse(fs.readFileSync(file, "utf8"));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is string => typeof row === "string" && row.trim().length > 0);
}

function providerModels(profile: Record<string, unknown>): string[] {
  const models = profile.models;
  if (!Array.isArray(models)) return [];
  const ids: string[] = [];
  for (const row of models) {
    if (typeof row === "string" && row.trim()) {
      ids.push(row.trim());
      continue;
    }
    const rec = asRecord(row);
    if (typeof rec?.id === "string" && rec.id.trim()) ids.push(rec.id.trim());
  }
  return ids;
}

function normalizedBaseURL(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim().replace(/\/+$/, "");
}

function applyProjectModelCompatOverrides(
  providerId: string,
  profile: Record<string, unknown>,
): Record<string, unknown> {
  const baseURL = normalizedBaseURL(profile.baseURL);
  if (!baseURL || !Array.isArray(profile.models)) return profile;
  const applicable = PROJECT_MODEL_COMPAT_OVERRIDES.filter(
    (override) =>
      override.providerId === providerId && normalizedBaseURL(override.baseURL) === baseURL,
  );
  if (applicable.length === 0) return profile;

  let changed = false;
  const models = profile.models.map((model) => {
    const rec = asRecord(model);
    if (!rec || typeof rec.id !== "string") return model;
    const modelId = rec.id.trim();
    const override = applicable.find((candidate) => candidate.modelId === modelId);
    if (!override) return model;
    changed = true;
    return {
      ...rec,
      compat: {
        ...(asRecord(rec.compat) ?? {}),
        ...override.compat,
      },
    };
  });
  return changed ? { ...profile, models } : profile;
}

function modelInput(value: unknown): readonly ModelInputModality[] | undefined {
  const rec = asRecord(value);
  if (!rec || !("input" in rec) || !Array.isArray(rec.input)) return undefined;
  const result: ModelInputModality[] = [];
  for (const item of rec.input) {
    if ((item === "text" || item === "image") && !result.includes(item)) result.push(item);
  }
  return result;
}

/**
 * Read only explicit input metadata for one exact provider/model route.
 *
 * A live catalog is authoritative, including empty or missing metadata.
 * Only older runtimes without that API use the home profile's declarations.
 */
export function modelInputModalities(
  home: string,
  providerId: string,
  modelId: string,
  modelCatalog?: RuntimeModelCatalog,
): readonly ModelInputModality[] | undefined {
  if (modelCatalog) return modelCatalog.get(providerId)?.get(modelId)?.inputModalities;
  return modelInputModalitiesFromHome(home, providerId, modelId);
}

/** Read the `input:` list declared on one model inside the home's settings profile. */
export function modelInputModalitiesFromHome(
  home: string,
  providerId: string,
  modelId: string,
): readonly ModelInputModality[] | undefined {
  const settings = asRecord(readYamlFile(path.join(home, "settings.yaml")));
  const providers = asRecord(asRecord(settings?.["llm-pi-ai"])?.providers);
  const profile = asRecord(providers?.[providerId]);
  if (profile && Array.isArray(profile.models)) {
    for (const model of profile.models) {
      const rec = asRecord(model);
      if (rec?.id === modelId) return modelInput(rec);
    }
  }
  return undefined;
}

/**
 * Union of reasoningEffort ids declared by this provider's models in the
 * isolated home settings. Return value semantics:
 *   undefined → profile does not declare models (unknown; keep client default)
 *   []        → models declared WITHOUT any reasoningEfforts (unsupported)
 *   [ids]     → supported efforts
 */
export function providerReasoningEffortsFromHome(
  home: string,
  providerId: string,
): readonly string[] | undefined {
  try {
    const settings = asRecord(readYamlFile(path.join(home, "settings.yaml")));
    const providers = asRecord(asRecord(settings?.["llm-pi-ai"])?.providers);
    const profile = asRecord(providers?.[providerId]);
    if (!profile) return undefined;
    const models = Array.isArray(profile.models) ? profile.models : [];
    if (models.length === 0) return undefined;
    const efforts: string[] = [];
    let declared = false;
    for (const value of models) {
      const model = asRecord(value);
      const map = asRecord(model?.reasoningEfforts);
      if (!map) continue;
      declared = true;
      for (const id of Object.keys(map)) if (!efforts.includes(id)) efforts.push(id);
    }
    return declared ? efforts : [];
  } catch {
    return undefined;
  }
}

/**
 * Per-model reasoning levels exactly as the profile declares them.
 *
 * A provider-wide union cannot answer "does THIS model take an effort", and the
 * kernel validates the effort against the resolved model — so a surface that
 * only knows the union either hides levels a model does support or sends one to
 * a model that refuses it. Semantics per model id:
 *   missing   → the profile says nothing about that model (unknown; keep the
 *               provider-wide answer)
 *   []        → the model declares `reasoningEfforts: false` (supports none)
 *   [ids]     → exactly the levels that model offers
 * Returns undefined when the profile declares no models at all.
 */
export function providerModelEffortsFromHome(
  home: string,
  providerId: string,
): Record<string, readonly string[]> | undefined {
  try {
    const settings = asRecord(readYamlFile(path.join(home, "settings.yaml")));
    const providers = asRecord(asRecord(settings?.["llm-pi-ai"])?.providers);
    const profile = asRecord(providers?.[providerId]);
    if (!profile) return undefined;
    const models = Array.isArray(profile.models) ? profile.models : [];
    const out: Record<string, readonly string[]> = {};
    let declared = false;
    for (const value of models) {
      const model = asRecord(value);
      const id = typeof model?.id === "string" ? model.id.trim() : "";
      if (!id) continue;
      const levels = model?.reasoningEfforts;
      if (levels === false) {
        out[id] = [];
        declared = true;
        continue;
      }
      const map = asRecord(levels);
      if (!map) continue;
      out[id] = Object.keys(map);
      declared = true;
    }
    return declared ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The effort to actually send for one model: never one the model declares it
 * cannot take, and never a guess when the profile is silent.
 */
export function reasoningEffortForModel(
  home: string,
  providerId: string,
  modelId: string,
  requested?: string,
  catalog?: RuntimeModelCatalog,
): string | undefined {
  const want = requested?.trim();
  if (!want) return undefined;
  const declared = catalog
    ? catalog.get(providerId)?.get(modelId)?.efforts ?? []
    : providerModelEffortsFromHome(home, providerId)?.[modelId];
  if (declared === undefined) return want;
  return declared.includes(want) ? want : undefined;
}

function providerName(id: string, profile: Record<string, unknown>): string {
  if (typeof profile.displayName === "string" && profile.displayName.trim()) {
    return profile.displayName.trim();
  }
  return id;
}

export type MimoDesktopEndpoint = {
  readonly baseURL: string;
  readonly token: string;
  readonly directory: string;
};

const MIMO_DIRECTORY = "/Users/wu/XiaomiMiMoProjects";

function sha1Hex(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function mimoTokenStorePath(directory: string): string {
  const roots = [
    path.join(process.env.HOME ?? "", "Library", "Application Support", "Xiaomi MiMo", "mimocode"),
    path.join(process.env.HOME ?? "", ".local/share/mimocode"),
  ];
  const target = path.join(roots[0]!, "llm-server", sha1Hex(path.resolve(directory)), "tokens.json");
  for (const root of roots) {
    const candidate = path.join(root, "llm-server", sha1Hex(path.resolve(directory)), "tokens.json");
    if (fs.existsSync(path.dirname(candidate))) return candidate;
  }
  return target;
}

/**
 * Mint our own token inside the MiMo Desktop token store — the gateway
 * validates Bearer tokens against exactly this store. Used only when the
 * isolated home has no usable credential yet.
 */
export function mintMimoDesktopToken(directory = MIMO_DIRECTORY): string {
  const token = randomBytes(32).toString("base64url");
  const record = {
    id: `llmk_${randomBytes(8).toString("hex")}`,
    hash: createHash("sha256").update(token).digest("hex"),
    label: "open-slidestudio",
    models: [],
    created: Date.now(),
    idle_ms: 30 * 24 * 3600 * 1000,
  };
  const storePath = mimoTokenStorePath(directory);
  fs.mkdirSync(path.dirname(storePath), { recursive: true, mode: 0o700 });
  let store: { version?: number; tokens?: Array<Record<string, unknown>> } = { version: 1, tokens: [] };
  if (fs.existsSync(storePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(storePath, "utf8"));
      if (raw && Array.isArray(raw.tokens)) store = raw;
    } catch {
      /* rebuild */
    }
  }
  store.version = 1;
  store.tokens = [
    ...(store.tokens ?? []).filter((t) => t?.label !== "open-slidestudio" && t?.label !== "dsh-mimo-desktop"),
    record,
  ];
  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(storePath, 0o600);
  return token;
}

async function mimoEngineCandidates(): Promise<number[]> {
  const exec = promisify(execFile);
  const { stdout } = await exec("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], { timeout: 4000 });
  const ports: number[] = [];
  for (const line of stdout.split("\n")) {
    if (!/^Xiaomi/.test(line.trim())) continue;
    const match = line.match(/127\.0\.0\.1:(\d+)/);
    const port = match ? Number(match[1]) : NaN;
    if (Number.isFinite(port) && !ports.includes(port)) ports.push(port);
  }
  return ports;
}

/**
 * Discover the live MiMo Desktop engine (dynamic loopback port per app
 * session) by probing each Xiaomi listener with a known-good credential.
 * Minting is a fallback for a home that has no credential yet.
 */
export async function discoverMimoDesktopEndpoint(
  directory = MIMO_DIRECTORY,
  knownKey?: string,
): Promise<MimoDesktopEndpoint | undefined> {
  let ports: number[] = [];
  try {
    ports = await mimoEngineCandidates();
  } catch {
    return undefined;
  }
  const key = knownKey?.trim() || mintMimoDesktopToken(directory);
  for (const port of ports) {
    const baseURL = `http://127.0.0.1:${port}/v1`;
    try {
      const res = await fetch(`${baseURL}/models`, {
        headers: {
          Authorization: `Bearer ${key}`,
          "x-mimocode-directory": directory,
        },
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) return { baseURL, token: key, directory };
    } catch {
      /* try next listener */
    }
  }
  return undefined;
}

function readMimoProfile(destHome: string): Record<string, unknown> | undefined {
  try {
    const settings = asRecord(readYamlFile(path.join(destHome, "settings.yaml")));
    const providers = asRecord(asRecord(settings?.["llm-pi-ai"])?.providers);
    return asRecord(providers?.["mimo-desktop"]);
  } catch {
    return undefined;
  }
}

function writeMimoRoute(destHome: string, endpoint: MimoDesktopEndpoint): void {
  // settings.yaml: keep the full profile, only refresh baseURL.
  const settingsFile = path.join(destHome, "settings.yaml");
  if (fs.existsSync(settingsFile)) {
    try {
      const settings = asRecord(readYamlFile(settingsFile)) ?? {};
      const llm = asRecord(settings["llm-pi-ai"]);
      const providers = asRecord(llm?.providers);
      const mimo = asRecord(providers?.["mimo-desktop"]);
      if (mimo) {
        mimo.baseURL = endpoint.baseURL;
        fs.writeFileSync(settingsFile, YAML.stringify(settings));
        chmodOwnerOnlyFile(settingsFile);
      }
    } catch {
      /* best-effort */
    }
  }
  // .credentials.yaml: refresh ONLY our ref, preserving records block.
  const credPath = path.join(destHome, ".credentials.yaml");
  let doc: { version?: number; refs?: Record<string, unknown>; records?: unknown } = {};
  if (fs.existsSync(credPath)) {
    try {
      doc = asRecord(readYamlFile(credPath)) ?? {};
    } catch {
      doc = {};
    }
  }
  doc.version = doc.version ?? 1;
  doc.refs = { ...(doc.refs ?? {}), MIMO_DESKTOP_API_KEY: endpoint.token };
  const out = { version: doc.version, refs: doc.refs, ...(doc.records ? { records: doc.records } : {}) };
  fs.writeFileSync(credPath, YAML.stringify(out), { mode: 0o600 });
  fs.chmodSync(credPath, 0o600);
  process.env.MIMO_DESKTOP_API_KEY = endpoint.token;
}

/**
 * Resolve the live MiMo Desktop gateway and align the isolated home with it.
 * Prefers the credential already in the isolated home; mints only when the
 * home has none. Returns the endpoint when the desktop engine answers.
 */
export async function syncMimoDesktopProvider(destHome: string): Promise<MimoDesktopEndpoint | undefined> {
  const profile = readMimoProfile(destHome);
  if (!profile) return undefined;
  let directory = MIMO_DIRECTORY;
  const headers = asRecord(profile.headers);
  if (headers && typeof headers["x-mimocode-directory"] === "string") {
    directory = String(headers["x-mimocode-directory"]);
  }
  const refs = asRecord(asRecord(readYamlFileSafe(path.join(destHome, ".credentials.yaml")))?.refs);
  const knownKey = typeof refs?.MIMO_DESKTOP_API_KEY === "string"
    ? refs.MIMO_DESKTOP_API_KEY
    : process.env.MIMO_DESKTOP_API_KEY?.trim() || undefined;
  const endpoint = await discoverMimoDesktopEndpoint(directory, knownKey);
  if (endpoint) writeMimoRoute(destHome, endpoint);
  return endpoint;
}

function readYamlFileSafe(file: string): unknown {
  try {
    return readYamlFile(file);
  } catch {
    return undefined;
  }
}

/**
 * Fast fail with the exact user action when the MiMo Desktop engine is not
 * reachable, instead of an opaque 404/502 in the middle of a turn.
 */
export async function assertMimoDesktopGateway(
  destHome: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const endpoint = await syncMimoDesktopProvider(destHome);
  const fallbackBase = "http://127.0.0.1:4096/v1";
  const baseURL = endpoint?.baseURL
    ?? readMimoProfile(destHome)?.baseURL
    ?? fallbackBase;
  const reachable = Boolean(endpoint) || await (async () => {
    try {
      const res = await fetchImpl(`${String(baseURL).replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${process.env.MIMO_DESKTOP_API_KEY ?? ""}` },
        signal: AbortSignal.timeout(3000),
      });
      return res.status < 500;
    } catch {
      return false;
    }
  })();
  if (!reachable) {
    throw new Error(
      "MiMo 桌面端引擎不可达：请确认 Xiaomi MiMo 应用已启动并登录（本地引擎端口随会话变化，Open SlideStudio 会在生成前自动发现）。打开 App 后重试即可。",
    );
  }
}

function chmodOwnerOnlyFile(file: string): void {
  fs.chmodSync(file, 0o600);
}

function chmodOwnerOnlyDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

function oauthCredentialIds(sourceHome: string): string[] {
  const ids: string[] = [];
  for (const name of OAUTH_ISOLATION_FILENAMES) {
    const file = path.join(sourceHome, name);
    if (!fs.existsSync(file)) continue;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      const rec = asRecord(parsed);
      const creds = asRecord(rec?.credentials);
      if (!creds) continue;
      for (const id of Object.keys(creds)) {
        if (!isAntigravityId(id) && !ids.includes(id)) ids.push(id);
      }
    } catch {
      // Isolation file is unreadable; skip listing, still do not copy.
    }
  }
  return ids;
}

function credentialRefs(sourceHome: string): Record<string, string> {
  const raw = readYamlFile(path.join(sourceHome, ".credentials.yaml"));
  const refs = asRecord(asRecord(raw)?.refs);
  const out: Record<string, string> = {};
  if (!refs) return out;
  for (const [name, value] of Object.entries(refs)) {
    if (typeof value === "string" && value.trim()) out[name] = value.trim();
  }
  return out;
}

function pickDefault(
  providers: readonly ImportedProvider[],
  requestedProvider?: string,
  requestedModel?: string,
): { provider: string; model: string } {
  if (requestedProvider && !isAntigravityId(requestedProvider)) {
    const match = providers.find((row) => row.id === requestedProvider);
    if (match) {
      const model =
        requestedModel && !isAntigravityId(requestedModel) && match.models.includes(requestedModel)
          ? requestedModel
          : match.models[0] ?? requestedModel ?? "";
      if (model && !isAntigravityId(model)) return { provider: match.id, model };
    }
  }
  const amd = providers.find((row) => row.id === "amd");
  if (amd?.models[0]) return { provider: "amd", model: amd.models[0] };
  const ready = providers.find((row) => row.ready && row.models[0]);
  if (ready?.models[0]) return { provider: ready.id, model: ready.models[0] };
  const first = providers[0];
  if (first) return { provider: first.id, model: first.models[0] ?? "MiniMax-M3" };
  return { provider: "minimax-cn", model: "MiniMax-M3" };
}

export function catalogPath(destHome: string): string {
  return path.join(destHome, SLIDES_MODEL_CATALOG_FILENAME);
}

export function loadSlidesModelCatalog(destHome: string): SlidesModelCatalog | undefined {
  const file = catalogPath(destHome);
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    const rec = asRecord(parsed);
    if (!rec || !Array.isArray(rec.providers) || typeof rec.defaultProvider !== "string") {
      return undefined;
    }
    return parsed as SlidesModelCatalog;
  } catch {
    return undefined;
  }
}

export function applyCatalogEnv(catalog: SlidesModelCatalog, env: NodeJS.ProcessEnv): void {
  if (!env.SLIDESTUDIO_LLM_PROVIDER?.trim()) env.SLIDESTUDIO_LLM_PROVIDER = catalog.defaultProvider;
  if (!env.SLIDESTUDIO_LLM_MODEL?.trim()) env.SLIDESTUDIO_LLM_MODEL = catalog.defaultModel;
}

/**
 * Copy API-key providers from the local DSH App settings into an isolated
 * slides home. Never copies OAuth grant files. Drops Antigravity.
 */
export function importLocalDshModels(input: ImportLocalDshModelsInput): ImportLocalDshModelsResult {
  const destHome = assertIsolatedDshHome(input.destHome, {
    userDshHome: input.userHomeDir ? path.join(input.userHomeDir, ".dsh") : undefined,
  });
  const sourceHome = path.resolve(input.sourceHome ?? userDshHome(input.userHomeDir));
  if (path.resolve(sourceHome) === destHome) {
    throw new Error("refusing to import a DSH home onto itself");
  }

  chmodOwnerOnlyDir(destHome);
  const env = input.env ?? process.env;
  const settings = asRecord(readYamlFile(path.join(sourceHome, "settings.yaml"))) ?? {};
  const llm = asRecord(settings["llm-pi-ai"]);
  const rawProviders = asRecord(llm?.providers) ?? {};
  const refs = credentialRefs(sourceHome);
  const excluded: string[] = [];
  const imported: ImportedProvider[] = [];
  const noteExcluded = (id: string) => {
    if (!excluded.includes(id)) excluded.push(id);
  };

  for (const [id, value] of Object.entries(rawProviders)) {
    if (isAntigravityId(id)) {
      noteExcluded(id);
      continue;
    }
    const profile = applyProjectModelCompatOverrides(id, asRecord(value) ?? {});
    const apiKeyEnv = typeof profile.apiKeyEnv === "string" ? profile.apiKeyEnv.trim() : undefined;
    const models = providerModels(profile);
    const ready = Boolean(apiKeyEnv && (env[apiKeyEnv]?.trim() || refs[apiKeyEnv]));
    imported.push({
      id,
      name: providerName(id, profile),
      apiKeyEnv,
      models: models.length > 0 ? models : id === "minimax-cn" ? ["MiniMax-M3", "MiniMax-M2.7"] : [],
      ready,
      profile,
    });
  }

  // Operator-added providers survive regeneration; they never override an
  // imported id, and their key lands via credentials/<id>.key (hub key login).
  const localExtras = readLocalProviderExtras(destHome, env);
  for (const extra of localExtras) {
    if (imported.some((row) => row.id === extra.id)) continue;
    imported.push(extra);
  }

  const requested = asRecord(settings["agent-default-model"]);
  const requestedProvider = typeof requested?.provider === "string" ? requested.provider : undefined;
  const requestedModel = typeof requested?.model === "string" ? requested.model : undefined;
  if (requestedProvider && isAntigravityId(requestedProvider)) noteExcluded(requestedProvider);
  const picked = pickDefault(imported, requestedProvider, requestedModel);

  const envBindings: Record<string, string> = {};
  const destRefs: Record<string, string> = {};
  // Keys saved through the product live in credentials/<providerId>.key;
  // rebind them so generation routing survives kernel restarts.
  for (const row of imported) {
    if (!row.apiKeyEnv) continue;
    const keyFile = path.join(destHome, "credentials", `${row.id}.key`);
    if (fs.existsSync(keyFile)) {
      const value = fs.readFileSync(keyFile, "utf8").trim();
      if (value) {
        env[row.apiKeyEnv] = value;
        envBindings[row.apiKeyEnv] = value;
        continue;
      }
    }
    const value = env[row.apiKeyEnv]?.trim() || refs[row.apiKeyEnv];
    if (!value) continue;
    destRefs[row.apiKeyEnv] = value;
    if (!env[row.apiKeyEnv]?.trim()) envBindings[row.apiKeyEnv] = value;
  }

  const catalog: SlidesModelCatalog = {
    sourceHome,
    destHome,
    excluded,
    oauthSkipped: oauthCredentialIds(sourceHome),
    defaultProvider: picked.provider,
    defaultModel: picked.model,
    providers: imported.map(({ profile: _profile, ...rest }) => rest),
  };

  const destProviders: Record<string, unknown> = {};
  for (const row of imported) {
    if (row.profile) destProviders[row.id] = kernelProviderProfile(row.profile);
  }

  const destSettings = {
    "agent-default-model": {
      provider: catalog.defaultProvider,
      model: catalog.defaultModel,
    },
    "llm-pi-ai": {
      providers: destProviders,
    },
  };
  const settingsFile = path.join(destHome, "settings.yaml");
  fs.writeFileSync(settingsFile, YAML.stringify(destSettings));
  chmodOwnerOnlyFile(settingsFile);

  const credFile = path.join(destHome, ".credentials.yaml");
  fs.writeFileSync(credFile, YAML.stringify({ version: 1, refs: destRefs }));
  chmodOwnerOnlyFile(credFile);

  const catalogFile = catalogPath(destHome);
  fs.writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`);
  chmodOwnerOnlyFile(catalogFile);

  applyCatalogEnv(catalog, env);
  for (const [name, value] of Object.entries(envBindings)) env[name] = value;
  return { catalog, envBindings };
}
