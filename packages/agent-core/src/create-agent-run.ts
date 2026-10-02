/**
 * Public factory: createAgentRun(input, options?)
 */

import { createAgentRunInternal } from "./agent-run.js";
import type { AgentRun } from "./agent-run.js";
import { MockProvider } from "./mock-provider.js";
import {
  formatPinBatchInstruction,
  type AgentPin,
} from "./pin-batch.js";
import { AgentRunInputSchema } from "./schemas.js";
import type { AgentRunInput, CreateAgentRunOptions } from "./types.js";

/**
 * Create an agent run.
 * Provider must be injected by the composition root (no silent Mock default).
 * When `autoStart` is true (default), the pipeline begins immediately.
 */
export function createAgentRun(
  input: AgentRunInput,
  options: CreateAgentRunOptions = {},
): AgentRun {
  const parsed = validateInput(input);

  if (!options.provider) {
    throw new Error(
      "createAgentRun requires options.provider. Inject MockProvider at the app composition root for offline demos.",
    );
  }
  const provider = options.provider;
  const run = createAgentRunInternal(parsed, provider, options);

  if (options.autoStart !== false) {
    // Fire and forget; consumers use run.wait() / subscribe
    void run.start();
  }

  return run;
}

/**
 * Convenience: generate a new deck. Defaults to MockProvider only for CLI/smoke.
 * Prefer createAgentRun({ provider }) in product UI.
 */
export async function generateDeck(
  input: AgentRunInput,
  options: CreateAgentRunOptions = {},
): Promise<import("./types.js").AgentRunResult> {
  const run = createAgentRun(input, {
    ...options,
    provider: options.provider ?? new MockProvider({ baseDelayMs: 0 }),
    autoStart: true,
  });
  return run.wait();
}

/**
 * Process open agent annotation pins in one batch → new version.
 * Partial failures keep failed pin ids + reasons; no full-deck auto-rollback.
 */
export async function processPinBatch(
  base: {
    deck: import("@open-slidestudio/pptd").Deck;
    versionNumber?: number;
    versionId?: string;
  },
  pins: AgentPin[],
  options: CreateAgentRunOptions & {
    modelId?: string;
    mockSpeed?: number;
  } = {},
): Promise<import("./types.js").AgentRunResult> {
  if (!pins.length) {
    throw new Error("processPinBatch requires at least one pin");
  }
  const fromMeta = base.deck.meta?.versionNumber
    ? Number(base.deck.meta.versionNumber)
    : undefined;
  const run = createAgentRun(
    {
      prompt: formatPinBatchInstruction(pins),
      baseDeck: base.deck,
      baseVersionNumber:
        base.versionNumber ??
        (Number.isFinite(fromMeta) ? fromMeta : undefined) ??
        1,
      baseVersionId: base.versionId ?? base.deck.versionId,
      pins,
      modelId: options.modelId,
      mockSpeed: options.mockSpeed,
      title: base.deck.title,
    },
    {
      ...options,
      provider: options.provider ?? new MockProvider({ baseDelayMs: 0 }),
    },
  );
  return run.wait();
}

/**
 * Convenience: refine an existing deck; version number bumps.
 */
export async function refineDeck(
  base: {
    deck: import("@open-slidestudio/pptd").Deck;
    versionNumber?: number;
    versionId?: string;
  },
  instruction: string,
  options: CreateAgentRunOptions & {
    modelId?: string;
    designContract?: string;
    mockSpeed?: number;
  } = {},
): Promise<import("./types.js").AgentRunResult> {
  const fromMeta = base.deck.meta?.versionNumber
    ? Number(base.deck.meta.versionNumber)
    : undefined;
  const run = createAgentRun(
    {
      prompt: instruction,
      baseDeck: base.deck,
      baseVersionNumber:
        base.versionNumber ??
        (Number.isFinite(fromMeta) ? fromMeta : undefined) ??
        1,
      baseVersionId: base.versionId ?? base.deck.versionId,
      modelId: options.modelId,
      designContract: options.designContract,
      mockSpeed: options.mockSpeed,
      title: base.deck.title,
    },
    {
      ...options,
      provider: options.provider ?? new MockProvider({ baseDelayMs: 0 }),
    },
  );
  return run.wait();
}

function validateInput(input: AgentRunInput): AgentRunInput {
  const result = AgentRunInputSchema.safeParse(input);
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid AgentRunInput: ${msg}`);
  }
  const pins = result.data.pins ?? input.pins;
  const prompt =
    (result.data.prompt ?? input.prompt ?? "").trim() ||
    (pins?.length
      ? `Process ${pins.length} agent annotation(s)`
      : "");
  // Preserve full input (including baseDeck typed as Deck) after field checks
  return {
    ...input,
    prompt,
    pins,
    mockSpeed: result.data.mockSpeed,
  };
}
