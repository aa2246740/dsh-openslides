/**
 * Provider-agnostic LLM / agent backend interface.
 * Core APIs never hardcode a single vendor.
 */

import type { Deck } from "@open-slidestudio/pptd";
import type { ToolEvent } from "./events.js";
import type { AgentRunInput, AgentRunMode } from "./types.js";

export interface ProviderRunContext {
  runId: string;
  input: AgentRunInput;
  signal: AbortSignal;
  mode: AgentRunMode;
  /** Prior deck when refining */
  priorDeck?: Deck;
}

/**
 * Thin replaceable backend. Implementations stream ToolEvents;
 * AgentRun owns status aggregation and public API.
 */
export interface LlmProvider {
  readonly id: string;
  readonly displayName: string;
  run(ctx: ProviderRunContext): AsyncIterable<ToolEvent>;
}

export function resolveRunMode(input: AgentRunInput): AgentRunMode {
  if (input.baseDeck && input.pins && input.pins.length > 0) return "pin-batch";
  return input.baseDeck ? "refine" : "generate";
}
