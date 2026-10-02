/**
 * Resolve LLM HTTP credentials without hardcoding vendors.
 * Priority:
 * 1. OPENSLIDESTUDIO_API_KEY / OPENAI_API_KEY / XAI_API_KEY
 *    + matching *_BASE_URL + *_MODEL env (all explicit — no vendor default)
 * 2. Opt-in only: OPENSLIDESTUDIO_GROK_AUTH=1 reuses a Grok CLI login at
 *    ~/.grok/auth.json → GROK_CLI_CHAT_PROXY_BASE_URL (required). The file is
 *    never read unless that flag is set.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export type LlmCredentials = {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Extra headers (e.g. x-grok-client-version) */
  headers: Record<string, string>;
  source: "env" | "grok-auth";
};

/** Env flag that explicitly opts in to reading ~/.grok/auth.json. */
export const GROK_AUTH_ENV = "OPENSLIDESTUDIO_GROK_AUTH";

function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return undefined;
}

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function readGrokAuth(): {
  key: string;
  userId?: string;
  expiresAt?: string;
} | null {
  const path = join(homedir(), ".grok", "auth.json");
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      { key?: string; user_id?: string; expires_at?: string }
    >;
    const entry = Object.values(raw)[0];
    if (!entry?.key) return null;
    if (entry.expires_at) {
      const exp = Date.parse(entry.expires_at);
      if (Number.isFinite(exp) && exp < Date.now() - 60_000) {
        return null;
      }
    }
    return {
      key: entry.key,
      userId: entry.user_id,
      expiresAt: entry.expires_at,
    };
  } catch {
    return null;
  }
}

/**
 * Returns null when no complete explicit configuration exists. An API key
 * without a base URL (or vice versa) is treated as unconfigured rather than
 * silently targeting a public SaaS endpoint.
 */
export function resolveLlmCredentials(
  modelOverride?: string,
): LlmCredentials | null {
  const envKey = firstEnv(
    "OPENSLIDESTUDIO_API_KEY",
    "OPENAI_API_KEY",
    "XAI_API_KEY",
  );
  const envBase = firstEnv(
    "OPENSLIDESTUDIO_BASE_URL",
    "OPENAI_BASE_URL",
    "XAI_BASE_URL",
  );
  const envModel =
    modelOverride ||
    firstEnv(
      "OPENSLIDESTUDIO_MODEL",
      "OPENAI_MODEL",
      "XAI_MODEL",
      "GROK_MODEL",
    );

  if (envKey && envBase) {
    return {
      apiKey: envKey,
      baseUrl: envBase.replace(/\/$/, ""),
      model: envModel ?? "",
      headers: {},
      source: "env",
    };
  }

  // Opt-in Grok CLI session reuse — never read the file silently.
  if (envFlag(GROK_AUTH_ENV)) {
    const grok = readGrokAuth();
    const grokBase = firstEnv("GROK_CLI_CHAT_PROXY_BASE_URL");
    if (grok && grokBase) {
      const headers: Record<string, string> = {
        "x-grok-client-version": firstEnv("GROK_CLI_VERSION") || "0.2.118",
        "x-grok-client-surface": "open-slidestudio",
        "User-Agent": "open-slidestudio/0.1",
      };
      if (grok.userId) headers["x-grok-user-id"] = grok.userId;
      return {
        apiKey: grok.key,
        baseUrl: grokBase.replace(/\/$/, ""),
        model: envModel ?? "",
        headers,
        source: "grok-auth",
      };
    }
  }

  return null;
}

export function hasLlmCredentials(): boolean {
  return resolveLlmCredentials() != null;
}
