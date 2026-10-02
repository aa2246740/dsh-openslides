/**
 * Real LLM provider: plan with visible tools, then generate DeckOutline → PPTD.
 */

import {
  assembleDesignSystemPrompt,
  contractToThemeTokens,
  defaultConsultingContract,
} from "@open-slidestudio/design-brain";
import { parseDeck, type Deck } from "@open-slidestudio/pptd";
import { chatCompletion, extractJsonObject } from "./llm/chat.js";
import {
  compileOutlineToDeckDetailed,
  parseOutline,
} from "./llm/compile-outline.js";
import { resolveLlmCredentials, type LlmCredentials } from "./llm/credentials.js";
import { OUTLINE_SYSTEM_PROMPT } from "./llm/outline-schema.js";
import {
  composeImageRebuildDeck,
  detectImageRebuildIntent,
} from "./image-rebuild.js";
import { nowIso, type ToolEvent } from "./events.js";
import {
  applyPinBatchToDeck,
  formatPinBatchInstruction,
} from "./pin-batch.js";
import type { LlmProvider, ProviderRunContext } from "./provider.js";
import type { ToolName } from "./types.js";
import { toolLabel, versionNumberFromDeck } from "./types.js";
import { abortError, createId, titleFromPrompt } from "./util.js";
import { nextVersion } from "./version.js";

export type RealLlmProviderOptions = {
  credentials?: LlmCredentials;
  model?: string;
};

export class RealLlmProvider implements LlmProvider {
  readonly id = "llm";
  readonly displayName = "LLM Provider";
  private readonly credentials: LlmCredentials;

  constructor(options: RealLlmProviderOptions = {}) {
    const creds =
      options.credentials ?? resolveLlmCredentials(options.model);
    if (!creds) {
      throw new Error(
        "No LLM credentials. Set OPENSLIDESTUDIO_API_KEY + OPENSLIDESTUDIO_BASE_URL " +
          "(or OPENAI_/XAI_ equivalents), or opt in to a Grok CLI login with " +
          "OPENSLIDESTUDIO_GROK_AUTH=1 + GROK_CLI_CHAT_PROXY_BASE_URL.",
      );
    }
    if (options.model) creds.model = options.model;
    if (!creds.model.trim()) {
      throw new Error(
        "No LLM model configured. Pass options.model or set " +
          "OPENSLIDESTUDIO_MODEL / OPENAI_MODEL / XAI_MODEL — there is no vendor default.",
      );
    }
    this.credentials = creds;
  }

  async *run(ctx: ProviderRunContext): AsyncIterable<ToolEvent> {
    const throwIfAborted = () => {
      if (ctx.signal.aborted) throw abortError();
    };

    yield { type: "run_status", status: "queued", at: nowIso() };
    yield { type: "run_status", status: "planning", at: nowIso() };

    // Think
    yield* this.step(ctx, "think", undefined, async () => {
      throwIfAborted();
      return {
        summary:
          ctx.mode === "refine"
            ? "Scoped natural-language refinement"
            : "Audience, narrative arc, and slide budget framed",
        detail: ctx.input.prompt.slice(0, 400),
      };
    });

    // Read references
    if (ctx.input.references?.length) {
      for (const ref of ctx.input.references.slice(0, 6)) {
        yield* this.step(ctx, "read_file", ref.name, async () => {
          throwIfAborted();
          return {
            summary: `Ingested ${ref.name}`,
            detail: (ref.text ?? "").slice(0, 500) || "Metadata only",
          };
        });
      }
    }

    // Todo
    yield* this.step(ctx, "write_todo", "plan.md", async () => {
      throwIfAborted();
      const todos =
        ctx.mode === "pin-batch"
          ? [
              "Locate pin targets on prior deck",
              "Apply scoped object edits",
              "Record per-pin success/failure",
              "Version only if any pin succeeded",
            ]
          : ctx.mode === "refine"
            ? ["Interpret refinement", "Rewrite outline", "Recompile PPTD", "Snapshot version"]
            : [
                "Design contract bind",
                "LLM outline generation",
                "Compile PPTD elements",
                "Schema validate",
                "Version snapshot",
              ];
      return {
        summary: `${todos.length} steps`,
        detail: todos.map((t, i) => `${i + 1}. ${t}`).join("\n"),
      };
    });

    yield { type: "run_status", status: "composing", at: nowIso() };

    // ---- Pin-batch: NEVER fall through to full-deck regenerate ----
    if (ctx.mode === "pin-batch") {
      if (!ctx.priorDeck) {
        throw new Error("pin-batch requires baseDeck / priorDeck");
      }
      const pins = ctx.input.pins ?? [];
      if (!pins.length) {
        throw new Error("pin-batch requires non-empty pins[]");
      }

      const candidate = nextVersion(
        ctx.input.baseVersionNumber ??
          versionNumberFromDeck(ctx.priorDeck) ??
          1,
      );
      // Spatial + object-scoped apply (honors slide.size; nearest text/chart/smartart)
      // Same contract as MockProvider so Real + Mock both honor pin semantics (Decision 8).
      const applied = applyPinBatchToDeck(ctx.priorDeck, pins, candidate);

      yield* this.step(ctx, "edit_slide", "pin-batch", async () => {
        throwIfAborted();
        return {
          summary: applied.versionBumped
            ? `Applied ${applied.succeededPinIds.length}, failed ${applied.failedPins.length}`
            : `No pins applied (${applied.failedPins.length} failed)`,
          detail: [
            formatPinBatchInstruction(pins).slice(0, 400),
            "",
            applied.failedPins.map((f) => `fail ${f.id}: ${f.reason}`).join("\n") ||
              "all ok",
          ].join("\n"),
        };
      });

      const deck = applied.deck;
      parseDeck(deck);

      const versionNumber = applied.versionBumped
        ? applied.version!.versionNumber
        : (ctx.input.baseVersionNumber ??
          versionNumberFromDeck(ctx.priorDeck) ??
          1);
      const versionLabel = applied.versionBumped
        ? applied.version!.versionLabel
        : (ctx.priorDeck.meta?.versionLabel ?? `V${versionNumber}`);
      const versionId = applied.versionBumped
        ? applied.version!.versionId
        : ctx.priorDeck.versionId;

      yield* this.step(ctx, "validate_editability", "pptd", async () => {
        throwIfAborted();
        return {
          summary: "Pin edits stay structured PPTD objects",
          detail: `ok=${applied.succeededPinIds.length} fail=${applied.failedPins.length}`,
        };
      });

      if (applied.versionBumped) {
        yield* this.step(ctx, "version_snapshot", versionLabel, async () => ({
          summary: `${versionLabel} saved`,
          detail: versionId,
        }));
      } else {
        yield* this.step(ctx, "version_snapshot", "unchanged", async () => ({
          summary: "Version unchanged (no successful pins)",
          detail: versionId,
        }));
      }

      yield {
        type: "deck_ready",
        deck,
        versionId,
        versionNumber,
        versionLabel,
        at: nowIso(),
      };

      const summary = applied.versionBumped
        ? `Processed annotations → ${versionLabel}: ${applied.succeededPinIds.length} ok, ${applied.failedPins.length} failed (${this.credentials.model}).`
        : `No annotations applied (${applied.failedPins.length} failed). Version unchanged.`;

      yield {
        type: "message",
        role: "assistant",
        content: summary,
        at: nowIso(),
      };

      yield {
        type: "done",
        result: {
          deck,
          versionId,
          versionNumber,
          versionLabel,
          summary,
          steps: [],
          pinBatch: {
            succeededPinIds: applied.succeededPinIds,
            failedPins: applied.failedPins,
          },
        },
        at: nowIso(),
      };
      yield { type: "run_status", status: "ready", at: nowIso() };
      return;
    }

    // Design contract
    const design = defaultConsultingContract();
    const designPrompt = assembleDesignSystemPrompt(design);
    yield* this.step(ctx, "extract_theme", "design-contract", async () => {
      throwIfAborted();
      return {
        summary: design.name,
        detail: `density=${design.density}; accent=${design.tokens.colors.accent}`,
      };
    });

    // Image rebuild short-circuit (PRD §4.6) — structure engine, not bitmap
    let deck: Deck | undefined;
    const rebuild =
      ctx.mode !== "refine" &&
      detectImageRebuildIntent(ctx.input.prompt, ctx.input.references);

    if (rebuild) {
      yield* this.step(ctx, "research", "vision-structure", async () => {
        throwIfAborted();
        return {
          summary: "Image rebuild path selected",
          detail: (ctx.input.references ?? [])
            .map((r) => r.name)
            .join(", ") || "prompt hints only",
        };
      });

      const version = nextVersion(
        ctx.mode === "refine"
          ? Number(ctx.priorDeck?.meta?.versionNumber ?? 1)
          : 0,
      );
      yield* this.step(ctx, "compose_deck", "image-rebuild", async () => {
        throwIfAborted();
        deck = composeImageRebuildDeck({
          prompt: ctx.input.prompt,
          references: ctx.input.references,
          theme: contractToThemeTokens(design),
          version,
        });
        parseDeck(deck);
        return {
          summary: `${deck.slides.length} portrait slides · editable objects`,
          detail: "Cards, connectors, QA notes — not a full-page raster",
        };
      });

      yield* this.step(ctx, "vision_qa", "rebuild", async () => {
        throwIfAborted();
        return {
          summary: "Low-confidence OCR flags recorded",
          detail: "See rebuild QA slide for human review items",
        };
      });
    }

    // LLM compose (standard deck path)
    if (!deck) yield* this.step(ctx, "compose_deck", "outline.json", async () => {
      throwIfAborted();
      const titleHint =
        ctx.input.title?.trim() || titleFromPrompt(ctx.input.prompt);
      const refBlock =
        ctx.input.references
          ?.map((r) => `- ${r.name}${r.text ? `: ${r.text.slice(0, 400)}` : ""}`)
          .join("\n") || "(none)";

      const userContent =
        ctx.mode === "refine" && ctx.priorDeck
          ? [
              `Refine this existing deck titled "${ctx.priorDeck.title}" (${ctx.priorDeck.slides.length} slides).`,
              `Refinement instruction:\n${ctx.input.prompt}`,
              `Return a full replacement outline JSON (not a patch).`,
              `Previous slide titles: ${ctx.priorDeck.slides.map((s, i) => `${i + 1}. ${s.id}`).join("; ")}`,
            ].join("\n\n")
          : [
              `Create a presentation outline for:`,
              ctx.input.prompt,
              ``,
              `Preferred title hint: ${titleHint}`,
              `Template id: ${ctx.input.templateId ?? "freestyle"}`,
              `References:\n${refBlock}`,
              ``,
              `Design guidance (follow colors/density spirit):\n${designPrompt.slice(0, 2500)}`,
            ].join("\n");

      let completion;
      try {
        completion = await chatCompletion({
          credentials: this.credentials,
          messages: [
            { role: "system", content: OUTLINE_SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          temperature: 0.45,
          maxTokens: 6000,
          signal: ctx.signal,
          jsonMode: true,
        });
      } catch (err) {
        // Some gateways reject response_format — retry without json mode
        const msg = err instanceof Error ? err.message : String(err);
        if (/response_format|json_object|400/.test(msg)) {
          completion = await chatCompletion({
            credentials: this.credentials,
            messages: [
              { role: "system", content: OUTLINE_SYSTEM_PROMPT },
              { role: "user", content: userContent },
            ],
            temperature: 0.45,
            maxTokens: 6000,
            signal: ctx.signal,
            jsonMode: false,
          });
        } else {
          throw err;
        }
      }

      throwIfAborted();
      const outline = parseOutline(extractJsonObject(completion.content));
      const version = nextVersion(
        ctx.mode === "refine"
          ? Number(ctx.priorDeck?.meta?.versionNumber ?? 1)
          : 0,
      );
      const compiled = compileOutlineToDeckDetailed(outline, {
        versionId: version.versionId,
        meta: {
          versionNumber: String(version.versionNumber),
          versionLabel: version.versionLabel,
          model: completion.model,
          llmSource: this.credentials.source,
        },
      });
      deck = compiled.deck;
      // Validate via schema
      parseDeck(deck);
      return {
        summary: `${deck.slides.length} slides · design ${compiled.qualityScore} · ${completion.model}`,
        detail: [
          ...compiled.recipeIds.map(
            (id, i) =>
              `${i + 1}. [${id}] ${outline.slides[i]?.focus || outline.slides[i]?.title}`,
          ),
          "",
          "quality:",
          compiled.qualitySummary,
        ].join("\n"),
      };
    });

    if (!deck) throw new Error("compose_deck produced no deck");

    yield { type: "run_status", status: "validating", at: nowIso() };

    yield* this.step(ctx, "validate_editability", "pptd", async () => {
      throwIfAborted();
      const kinds = new Map<string, number>();
      for (const s of deck!.slides) {
        for (const el of s.elements) {
          kinds.set(el.kind, (kinds.get(el.kind) ?? 0) + 1);
        }
      }
      const summary = [...kinds.entries()].map(([k, n]) => `${k}:${n}`).join(", ");
      return {
        summary: "Structured elements only (no full-page bitmaps)",
        detail: summary,
      };
    });

    const versionNumber = Number(deck.meta?.versionNumber ?? 1);
    const versionLabel = deck.meta?.versionLabel ?? `V${versionNumber}`;
    const versionId = deck.versionId;

    yield* this.step(ctx, "version_snapshot", versionLabel, async () => ({
      summary: `${versionLabel} saved`,
      detail: versionId,
    }));

    yield {
      type: "deck_ready",
      deck,
      versionId,
      versionNumber,
      versionLabel,
      at: nowIso(),
    };

    const summary =
      ctx.mode === "refine"
        ? `Refined deck to ${versionLabel} (${deck.slides.length} slides) via ${this.credentials.model}.`
        : `Generated “${deck.title}” — ${deck.slides.length} editable slides via ${this.credentials.model}.`;

    yield {
      type: "message",
      role: "assistant",
      content: summary,
      at: nowIso(),
    };

    yield {
      type: "done",
      result: {
        deck,
        versionId,
        versionNumber,
        versionLabel,
        summary,
        steps: [],
      },
      at: nowIso(),
    };
  }

  private async *step(
    ctx: ProviderRunContext,
    tool: ToolName,
    target: string | undefined,
    work: () => Promise<{ summary: string; detail?: string }>,
  ): AsyncGenerator<ToolEvent> {
    const stepId = createId("step");
    const started = Date.now();
    yield {
      type: "tool_started",
      stepId,
      tool,
      label: toolLabel(tool),
      target,
      at: nowIso(),
    };
    try {
      const out = await work();
      yield {
        type: "tool_completed",
        stepId,
        tool,
        label: toolLabel(tool),
        summary: out.summary,
        durationMs: Date.now() - started,
        at: nowIso(),
      };
      if (out.detail) {
        yield {
          type: "tool_progress",
          stepId,
          message: out.detail,
          at: nowIso(),
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield {
        type: "tool_failed",
        stepId,
        tool,
        label: toolLabel(tool),
        error: message,
        durationMs: Date.now() - started,
        at: nowIso(),
      };
      throw err;
    }
  }
}
