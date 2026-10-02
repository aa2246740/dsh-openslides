/**
 * Agent harness types — provider-agnostic run model for DSH SlideStudio.
 */

import type { Deck } from "@open-slidestudio/pptd";

/** Pipeline status (architecture overview). */
export type AgentRunStatus =
  | "draft"
  | "queued"
  | "planning"
  | "composing"
  | "validating"
  | "ready"
  | "failed"
  | "cancelled"
  | "needs_input";

/** Visible tool actions (PRD agent timeline). */
export type ToolName =
  | "think"
  | "read_file"
  | "write_todo"
  | "execute_terminal"
  | "research"
  | "extract_theme"
  | "compose_deck"
  | "edit_slide"
  | "render"
  | "vision_qa"
  | "validate_editability"
  | "version_snapshot";

export type ToolStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface AgentStep {
  id: string;
  tool: ToolName;
  /** UI action label, e.g. "Think", "Read", "Write Todo" */
  label: string;
  /** Object / file name shown on the tool row */
  target?: string;
  status: ToolStepStatus;
  summary?: string;
  detail?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface AgentReference {
  id: string;
  name: string;
  mimeType?: string;
  /** Parsed text excerpt when available (offline mock uses this) */
  text?: string;
  sizeBytes?: number;
  /** Optional data URL for images (rebuild / inline preview) */
  dataUrl?: string;
  /** reference | image */
  kind?: "file" | "image";
}

export interface AgentRunInput {
  /** User prompt / brief */
  prompt: string;
  /** Deck title override; derived from prompt when omitted */
  title?: string;
  templateId?: string;
  /** Selected model id — free string; never vendor-locked in core */
  modelId?: string;
  references?: AgentReference[];
  /** Prior deck for refinement runs */
  baseDeck?: Deck;
  baseVersionId?: string;
  baseVersionNumber?: number;
  /**
   * Design contract text (from design-brain or DESIGN.md).
   * Injected into planning; not required for mock.
   */
  designContract?: string;
  /**
   * Mock delay multiplier. `0` = instant, `1` = default (~demo pace).
   * Ignored by non-mock providers unless they honor it.
   */
  mockSpeed?: number;
  /** Correlation id for logging / analytics */
  requestId?: string;
  /**
   * Agent annotation pins (work orders). When non-empty with baseDeck,
   * run mode is pin-batch.
   */
  pins?: import("./pin-batch.js").AgentPin[];
}

export interface AgentRunResult {
  deck: Deck;
  versionId: string;
  versionNumber: number;
  /** e.g. "V1", "V2" */
  versionLabel: string;
  summary: string;
  steps: AgentStep[];
  /** Short list of claims / sources for UI footnotes */
  citations?: Array<{
    id: string;
    title: string;
    excerpt?: string;
    source?: string;
  }>;
  /** Pin-batch outcomes (when mode was pin-batch) */
  pinBatch?: {
    succeededPinIds: string[];
    failedPins: Array<{ id: string; reason: string }>;
  };
}

export type AgentRunMode = "generate" | "refine" | "pin-batch";

export interface CreateAgentRunOptions {
  /** Defaults to MockProvider for offline demos */
  provider?: import("./provider.js").LlmProvider;
  /** Auto-start the run after create (default true) */
  autoStart?: boolean;
  signal?: AbortSignal;
}

export function isTerminalStatus(status: AgentRunStatus): boolean {
  return (
    status === "ready" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "needs_input"
  );
}

export function toolLabel(tool: ToolName): string {
  const labels: Record<ToolName, string> = {
    think: "Think",
    read_file: "Read",
    write_todo: "Write Todo",
    execute_terminal: "Execute Terminal",
    research: "Research",
    extract_theme: "Extract Theme",
    compose_deck: "Compose Deck",
    edit_slide: "Edit slide",
    render: "Render",
    vision_qa: "Vision QA",
    validate_editability: "Validate Editability",
    version_snapshot: "Version Snapshot",
  };
  return labels[tool];
}

/** Read version number from deck.meta if present. */
export function versionNumberFromDeck(deck: Deck): number | undefined {
  const raw = deck.meta?.versionNumber;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}
