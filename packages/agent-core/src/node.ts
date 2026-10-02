/**
 * Node-only entry — real LLM credentials + providers.
 * Import from `@open-slidestudio/agent-core/node` in servers/CLIs only.
 */

export { RealLlmProvider } from "./llm-provider.js";
export type { RealLlmProviderOptions } from "./llm-provider.js";
export {
  resolveProvider,
  hasLlmCredentials,
  resolveLlmCredentials,
} from "./resolve-provider.js";
export type { ResolveProviderOptions } from "./resolve-provider.js";
export type { LlmCredentials } from "./llm/credentials.js";
export {
  compileOutlineToDeck,
  compileOutlineToDeckDetailed,
  parseOutline,
} from "./llm/compile-outline.js";
