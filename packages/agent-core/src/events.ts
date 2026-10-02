/**
 * Tool event stream types — UI timeline consumes these.
 */

import type { Deck } from "@open-slidestudio/pptd";
import type {
  AgentRunResult,
  AgentRunStatus,
  AgentStep,
  ToolName,
} from "./types.js";

export type ToolEvent =
  | {
      type: "run_status";
      status: AgentRunStatus;
      at: string;
    }
  | {
      type: "tool_started";
      stepId: string;
      tool: ToolName;
      label: string;
      target?: string;
      at: string;
    }
  | {
      type: "tool_progress";
      stepId: string;
      message: string;
      at: string;
    }
  | {
      type: "tool_completed";
      stepId: string;
      tool: ToolName;
      label: string;
      summary: string;
      durationMs: number;
      at: string;
    }
  | {
      type: "tool_failed";
      stepId: string;
      tool: ToolName;
      label: string;
      error: string;
      durationMs: number;
      at: string;
    }
  | {
      type: "step_snapshot";
      steps: AgentStep[];
      at: string;
    }
  | {
      type: "message";
      role: "assistant" | "user" | "system";
      content: string;
      at: string;
    }
  | {
      type: "deck_ready";
      deck: Deck;
      versionId: string;
      versionNumber: number;
      versionLabel: string;
      at: string;
    }
  | {
      type: "needs_input";
      questions: string[];
      at: string;
    }
  | {
      type: "error";
      message: string;
      code?: string;
      at: string;
    }
  | {
      type: "done";
      result: AgentRunResult;
      at: string;
    };

export type ToolEventListener = (event: ToolEvent) => void;

export function nowIso(): string {
  return new Date().toISOString();
}
