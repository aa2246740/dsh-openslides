/**
 * @open-slidestudio/agent-core
 * Provider-agnostic agent harness for DSH SlideStudio.
 */

export type {
  AgentReference,
  AgentRunInput,
  AgentRunMode,
  AgentRunResult,
  AgentRunStatus,
  AgentStep,
  CreateAgentRunOptions,
  ToolName,
  ToolStepStatus,
} from "./types.js";
export { isTerminalStatus, toolLabel, versionNumberFromDeck } from "./types.js";

export type { ToolEvent, ToolEventListener } from "./events.js";
export { nowIso } from "./events.js";

export type { LlmProvider, ProviderRunContext } from "./provider.js";
export { resolveRunMode } from "./provider.js";

export { MockProvider } from "./mock-provider.js";
export type { MockProviderOptions } from "./mock-provider.js";

/** Outline types (browser-safe). Node compile helpers live in `./node`. */
export type { DeckOutline, OutlineSlide } from "./llm/outline-schema.js";

export { AgentRun } from "./agent-run.js";

export {
  createAgentRun,
  generateDeck,
  refineDeck,
  processPinBatch,
} from "./create-agent-run.js";

export {
  applyPinBatchToDeck,
  formatPinBatchInstruction,
  resolvePinPoint,
} from "./pin-batch.js";
export type { AgentPin, PinBatchApplyResult, PinFailure } from "./pin-batch.js";

export { composeSampleDeck, applyRefinement } from "./sample-deck.js";
export type { ComposeSampleDeckOptions } from "./sample-deck.js";

export {
  buildMockOutline,
  isChineseBusinessBrief,
  looksLikeQ3GrowthBrief,
} from "./mock-outline.js";

export {
  compileOutlineToDeck,
  compileOutlineToDeckDetailed,
  parseOutline,
} from "./llm/compile-outline.js";

export {
  composeImageRebuildDeck,
  detectImageRebuildIntent,
  extractNodesFromText,
  isImageMime,
} from "./image-rebuild.js";
export type { ImageRebuildInput } from "./image-rebuild.js";

export { nextVersion, versionLabel } from "./version.js";
export type { VersionStamp } from "./version.js";

export { assembleDesign, fallbackTheme } from "./design.js";
export type { DesignAssembly } from "./design.js";

export { createId, titleFromPrompt, isAbortError } from "./util.js";

export { AgentRunInputSchema, AgentReferenceSchema } from "./schemas.js";
