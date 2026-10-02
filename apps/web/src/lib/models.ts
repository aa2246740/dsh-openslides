/** Multi-model catalog — free string ids; no vendor lock-in in core. */

export type ModelOption = {
  id: string;
  label: string;
  description: string;
  offline?: boolean;
};

/**
 * Production defaults: real LLM via local API (Grok auth / OpenAI-compatible).
 * Mock remains available for offline demos.
 */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "auto",
    label: "Grok Auto",
    description: "Real LLM generation (Grok CLI auth or API key)",
  },
  {
    id: "grok-4.5",
    label: "Grok 4.5",
    description: "Explicit Grok model id",
  },
  {
    id: "mock-offline",
    label: "Mock Offline",
    description: "Deterministic demo · no network",
    offline: true,
  },
];

export const DEFAULT_MODEL_ID = "auto";

export function getModelLabel(id: string): string {
  return MODEL_OPTIONS.find((m) => m.id === id)?.label ?? id;
}
