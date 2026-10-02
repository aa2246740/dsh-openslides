import { MockProvider } from "./mock-provider.js";
import { RealLlmProvider } from "./llm-provider.js";
import { hasLlmCredentials, resolveLlmCredentials } from "./llm/credentials.js";
import type { LlmProvider } from "./provider.js";

export type ResolveProviderOptions = {
  /** Explicit model id from UI */
  modelId?: string;
  /** Force mock even if credentials exist */
  forceMock?: boolean;
};

/**
 * Env opt-in for the no-credentials mock fallback. Without it a missing
 * credential config is a hard error instead of a silent offline demo deck.
 */
export const MOCK_FALLBACK_ENV = "OPENSLIDESTUDIO_ALLOW_MOCK_FALLBACK";

function mockFallbackAllowed(): boolean {
  const v = process.env[MOCK_FALLBACK_ENV]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Prefer real LLM when credentials exist. Mock requires an explicit opt-in:
 * `forceMock`, a `mock`/`mock-offline` modelId, or the
 * OPENSLIDESTUDIO_ALLOW_MOCK_FALLBACK env flag when no credentials exist.
 * Otherwise this throws instead of silently returning a mock.
 */
export function resolveProvider(
  options: ResolveProviderOptions = {},
): LlmProvider {
  const modelId = options.modelId ?? "";
  if (
    options.forceMock ||
    modelId === "mock-offline" ||
    modelId === "mock"
  ) {
    return new MockProvider({ baseDelayMs: 80 });
  }

  if (hasLlmCredentials()) {
    const model =
      modelId && !modelId.startsWith("mock")
        ? modelId
        : resolveLlmCredentials()?.model;
    return new RealLlmProvider({ model });
  }

  if (mockFallbackAllowed()) {
    return new MockProvider({ baseDelayMs: 80 });
  }

  throw new Error(
    "No LLM credentials configured and mock fallback is disabled. " +
      `Set ${MOCK_FALLBACK_ENV}=1 to allow the offline mock provider, ` +
      "or configure explicit credentials (see resolveLlmCredentials).",
  );
}

export { hasLlmCredentials, resolveLlmCredentials };
