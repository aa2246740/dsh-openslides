/**
 * Deterministic mock provider — Think / Read / Todo / Terminal / Edit
 * with delays; emits a structured PPTD deck via built-in compose.
 */

import type { Deck } from "@open-slidestudio/pptd";
import { assembleDesign } from "./design.js";
import { nowIso, type ToolEvent } from "./events.js";
import type { LlmProvider, ProviderRunContext } from "./provider.js";
import {
  composeImageRebuildDeck,
  detectImageRebuildIntent,
} from "./image-rebuild.js";
import { compileOutlineToDeckDetailed } from "./llm/compile-outline.js";
import { buildMockOutline } from "./mock-outline.js";
import {
  applyPinBatchToDeck,
  formatPinBatchInstruction,
} from "./pin-batch.js";
import { applyRefinement, composeSampleDeck } from "./sample-deck.js";
import type { ToolName } from "./types.js";
import { toolLabel, versionNumberFromDeck } from "./types.js";
import { abortError, createId, sleep, titleFromPrompt } from "./util.js";
import { nextVersion } from "./version.js";

export interface MockProviderOptions {
  /** Base delay unit in ms (default 280). Multiplied by input.mockSpeed. */
  baseDelayMs?: number;
  /**
   * Legacy override: when set, bypasses design-brain outline compile and uses
   * this sample-deck factory (tests only).
   */
  compose?: typeof composeSampleDeck;
  /** When true (default), generate path uses outline → CompositionPlan → PPTD. */
  useDesignBrainCompose?: boolean;
}

export class MockProvider implements LlmProvider {
  readonly id = "mock";
  readonly displayName = "Mock Provider";

  private readonly baseDelayMs: number;
  private readonly compose: typeof composeSampleDeck;
  private readonly useDesignBrainCompose: boolean;

  constructor(options: MockProviderOptions = {}) {
    this.baseDelayMs = options.baseDelayMs ?? 280;
    this.compose = options.compose ?? composeSampleDeck;
    this.useDesignBrainCompose = options.useDesignBrainCompose !== false;
  }

  async *run(ctx: ProviderRunContext): AsyncIterable<ToolEvent> {
    const speed = ctx.input.mockSpeed ?? 1;
    const delay = (units: number) =>
      sleep(Math.round(this.baseDelayMs * units * speed), ctx.signal);

    const throwIfAborted = () => {
      if (ctx.signal.aborted) throw abortError();
    };

    yield {
      type: "run_status",
      status: "queued",
      at: nowIso(),
    };

    await delay(0.3);
    throwIfAborted();

    yield {
      type: "run_status",
      status: "planning",
      at: nowIso(),
    };

    // --- Think ---
    yield* this.step(ctx, "think", undefined, async function* (emit, stepId) {
      yield emit.progress(stepId, "Framing audience, goal, and slide budget…");
      await delay(1);
      throwIfAborted();
      yield emit.progress(stepId, "Selecting narrative arc and evidence map…");
      await delay(0.8);
      return {
        summary:
          ctx.mode === "refine"
            ? "Scoped refinement plan ready"
            : "Story map and assumptions drafted",
        detail:
          ctx.mode === "refine"
            ? `Refine instruction: ${ctx.input.prompt.slice(0, 200)}`
            : `Brief: ${ctx.input.prompt.slice(0, 200)}`,
      };
    });

    // --- Write Todo ---
    yield* this.step(ctx, "write_todo", "todo.md", async function* (emit, stepId) {
      await delay(0.6);
      throwIfAborted();
      const todos =
        ctx.mode === "refine"
          ? ["Parse refinement scope", "Edit affected slides", "Snapshot version"]
          : [
              "Ingest references",
              "Research key claims",
              "Extract design tokens",
              "Compose PPTD deck",
              "Validate structure",
              "Snapshot V1",
            ];
      yield emit.progress(stepId, todos.map((t, i) => `${i + 1}. ${t}`).join(" · "));
      await delay(0.5);
      return {
        summary: `Todo graph: ${todos.length} items`,
        detail: todos.join("\n"),
      };
    });

    // --- Read (references or brief) ---
    const refs = ctx.input.references ?? [];
    if (refs.length > 0) {
      for (const ref of refs) {
        yield* this.step(ctx, "read_file", ref.name, async function* (emit, stepId) {
          yield emit.progress(stepId, `Parsing ${ref.name}…`);
          await delay(0.9);
          throwIfAborted();
          const excerpt = ref.text?.slice(0, 180) ?? "Structured extract (mock)";
          return {
            summary: `Read ${ref.name}`,
            detail: excerpt,
          };
        });
      }
    } else {
      yield* this.step(ctx, "read_file", "brief.txt", async function* (emit, stepId) {
        yield emit.progress(stepId, "Reading user brief as primary source…");
        await delay(0.7);
        throwIfAborted();
        return {
          summary: "Brief ingested",
          detail: ctx.input.prompt.slice(0, 240),
        };
      });
    }

    if (ctx.mode === "generate") {
      // --- Terminal / research ---
      yield* this.step(
        ctx,
        "execute_terminal",
        "research.scan",
        async function* (emit, stepId) {
          yield emit.progress(stepId, "$ slidestudio-research --offline --mock");
          await delay(1);
          throwIfAborted();
          yield emit.progress(stepId, "Collecting illustrative metrics…");
          await delay(0.7);
          return {
            summary: "Offline research stubs ready",
            detail: "Used deterministic sample evidence (no network).",
          };
        },
      );

      yield* this.step(ctx, "research", "claims", async function* (emit, stepId) {
        await delay(0.8);
        throwIfAborted();
        yield emit.progress(stepId, "Binding claims to citations…");
        await delay(0.5);
        return {
          summary: "Claims + confidence annotated",
          detail: "Mock citations attached to deck.notes / citations[]",
        };
      });
    }

    // --- Design / theme ---
    yield {
      type: "run_status",
      status: "composing",
      at: nowIso(),
    };

    const design = assembleDesign({
      prompt: ctx.input.prompt,
      templateId: ctx.input.templateId,
      contractText: ctx.input.designContract,
    });

    yield* this.step(
      ctx,
      "extract_theme",
      ctx.input.templateId ?? "default",
      async function* (emit, stepId) {
        yield emit.progress(
          stepId,
          design.source === "design-brain"
            ? "Design brain theme resolved"
            : "Using fallback presentation theme",
        );
        await delay(0.6);
        throwIfAborted();
        return {
          summary: `Theme: ${design.theme.name ?? "presentation"}`,
          detail: design.promptBlock.slice(0, 280),
        };
      },
    );

    let deck!: Deck;
    let pinBatchMeta:
      | { succeededPinIds: string[]; failedPins: Array<{ id: string; reason: string }> }
      | undefined;
    const baseVn =
      ctx.mode === "refine" || ctx.mode === "pin-batch"
        ? (ctx.input.baseVersionNumber ??
          (ctx.priorDeck ? versionNumberFromDeck(ctx.priorDeck) : undefined) ??
          1)
        : undefined;
    let version = nextVersion(baseVn);

    if (ctx.mode === "pin-batch" && ctx.priorDeck) {
      const pins = ctx.input.pins ?? [];
      yield* this.step(ctx, "write_todo", "pins", async function* (emit, stepId) {
        yield emit.progress(stepId, `Queuing ${pins.length} agent annotation(s)…`);
        await delay(0.4);
        throwIfAborted();
        return {
          summary: `${pins.length} work order(s)`,
          detail: formatPinBatchInstruction(pins).slice(0, 280),
        };
      });

      yield* this.step(ctx, "edit_slide", "pin-batch", async function* (emit, stepId) {
        yield emit.progress(stepId, "Applying pin work orders to PPTD objects…");
        await delay(0.8);
        throwIfAborted();
        const applied = applyPinBatchToDeck(ctx.priorDeck!, pins, version);
        deck = applied.deck;
        pinBatchMeta = {
          succeededPinIds: applied.succeededPinIds,
          failedPins: applied.failedPins,
        };
        if (applied.versionBumped && applied.version) {
          version = applied.version;
        } else {
          // Keep prior version identity — no success, no bump
          const priorVn =
            ctx.input.baseVersionNumber ??
            versionNumberFromDeck(ctx.priorDeck!) ??
            1;
          version = {
            versionId: ctx.priorDeck!.versionId,
            versionNumber: priorVn,
            versionLabel:
              ctx.priorDeck!.meta?.versionLabel ?? `V${priorVn}`,
          };
        }
        return {
          summary: applied.versionBumped
            ? `Applied ${applied.succeededPinIds.length}, failed ${applied.failedPins.length}`
            : `No pins applied (${applied.failedPins.length} failed) — version unchanged`,
          detail:
            applied.failedPins.map((f) => `${f.id}: ${f.reason}`).join("; ") ||
            "all ok",
        };
      });
    } else if (ctx.mode === "refine" && ctx.priorDeck) {
      yield* this.step(ctx, "edit_slide", "scoped", async function* (emit, stepId) {
        yield emit.progress(stepId, "Applying refinement to PPTD objects…");
        await delay(1.2);
        throwIfAborted();
        return {
          summary: "Slide edits applied",
          detail: ctx.input.prompt.slice(0, 200),
        };
      });

      deck = applyRefinement(ctx.priorDeck, ctx.input.prompt, version);
    } else {
      const title = ctx.input.title?.trim() || titleFromPrompt(ctx.input.prompt);
      const rebuild = detectImageRebuildIntent(ctx.input.prompt, refs);

      if (rebuild) {
        yield* this.step(ctx, "research", "vision", async function* (emit, stepId) {
          yield emit.progress(stepId, "Detecting layout regions and text blocks…");
          await delay(1);
          throwIfAborted();
          yield emit.progress(stepId, "Inferring hierarchy and connectors…");
          await delay(0.8);
          return {
            summary: "Image structure hypothesized",
            detail: refs.map((r) => r.name).join(", ") || "prompt-only",
          };
        });

        yield* this.step(ctx, "compose_deck", "image-rebuild", async function* (emit, stepId) {
          yield emit.progress(stepId, "Rebuilding as editable PPTD objects…");
          await delay(1.2);
          throwIfAborted();
          return {
            summary: "Portrait rebuild deck composed",
            detail: "Cards + connectors + QA notes (not a full-page bitmap)",
          };
        });

        deck = composeImageRebuildDeck({
          prompt: ctx.input.prompt,
          references: refs,
          theme: design.theme,
          version,
        });

        yield* this.step(ctx, "vision_qa", "rebuild", async function* (emit, stepId) {
          yield emit.progress(stepId, "Flagging low-confidence OCR labels…");
          await delay(0.7);
          throwIfAborted();
          return {
            summary: "QA notes attached on slide 2",
            detail: "Review required — do not treat labels as ground truth",
          };
        });
      } else if (this.useDesignBrainCompose) {
        const outline = buildMockOutline(ctx.input.prompt, title);
        let compiledSummary = "";
        let qualityScore = 0;
        let recipeIds: string[] = [];

        yield* this.step(ctx, "compose_deck", title, async function* (emit, stepId) {
          yield emit.progress(stepId, "Design brain: select recipes + compose plans…");
          await delay(1.0);
          throwIfAborted();
          const compiled = compileOutlineToDeckDetailed(outline, {
            versionId: version.versionId,
            meta: {
              versionNumber: String(version.versionNumber),
              versionLabel: version.versionLabel,
              promptExcerpt: ctx.input.prompt.slice(0, 200),
              generator: "open-slidestudio/agent-core/mock",
            },
          });
          deck = compiled.deck;
          compiledSummary = compiled.qualitySummary;
          qualityScore = compiled.qualityScore;
          recipeIds = compiled.recipeIds;
          yield emit.progress(
            stepId,
            `Recipes: ${recipeIds.join(", ")} · score ${qualityScore}`,
          );
          await delay(0.6);
          return {
            summary: `PPTD via design-brain (score ${qualityScore})`,
            detail: `Title: ${deck.title} · ${deck.slides.length} slides · ${recipeIds.join(",")}`,
          };
        });

        if (refs.length > 0) {
          deck = {
            ...deck,
            references: [
              ...deck.references,
              ...refs.map((r) => ({
                id: createId("ref"),
                name: r.name,
                mimeType: r.mimeType ?? "application/octet-stream",
                status: "parsed" as const,
                parsedSummary: r.text?.slice(0, 160) ?? `Referenced: ${r.name}`,
              })),
            ],
          };
        }

        yield* this.step(ctx, "edit_slide", "polish", async function* (emit, stepId) {
          yield emit.progress(stepId, "Lint + polish pass (mock)…");
          await delay(0.5);
          throwIfAborted();
          return {
            summary: "Layout polish complete",
            detail: compiledSummary.slice(0, 280) || "design-brain quality applied",
          };
        });
      } else {
        yield* this.step(ctx, "compose_deck", title, async function* (emit, stepId) {
          yield emit.progress(stepId, "Composing structured slides…");
          await delay(1.4);
          throwIfAborted();
          yield emit.progress(stepId, "Adding chart, table, and process objects…");
          await delay(0.8);
          return {
            summary: "PPTD deck composed",
            detail: `Title: ${title}`,
          };
        });

        deck = this.compose({
          title,
          prompt: ctx.input.prompt,
          theme: design.theme,
          version,
          referenceNames: refs.map((r) => r.name),
        });

        yield* this.step(ctx, "edit_slide", "polish", async function* (emit, stepId) {
          yield emit.progress(stepId, "Polishing hierarchy and spacing…");
          await delay(0.7);
          throwIfAborted();
          return {
            summary: "Layout polish pass complete",
            detail: "Cross-slide title alignment checked (mock)",
          };
        });
      }
    }

    // --- Validate ---
    yield {
      type: "run_status",
      status: "validating",
      at: nowIso(),
    };

    yield* this.step(ctx, "validate_editability", "pptd", async function* (emit, stepId) {
      await delay(0.6);
      throwIfAborted();
      const objectCount = deck.slides.reduce((n, s) => n + s.elements.length, 0);
      yield emit.progress(
        stepId,
        `${deck.slides.length} slides · ${objectCount} objects · 0 full-page rasters`,
      );
      await delay(0.4);
      return {
        summary: "Editability checks passed",
        detail: "All slides use structured elements",
      };
    });

    yield* this.step(ctx, "version_snapshot", version.versionLabel, async function* (
      emit,
      stepId,
    ) {
      await delay(0.4);
      throwIfAborted();
      yield emit.progress(stepId, `Writing ${version.versionLabel} snapshot…`);
      return {
        summary: `${version.versionLabel} ready`,
        detail: version.versionId,
      };
    });

    // Ensure deck version fields match stamp
    deck = {
      ...deck,
      versionId: version.versionId,
      meta: {
        ...(deck.meta ?? {}),
        versionNumber: String(version.versionNumber),
        versionLabel: version.versionLabel,
      },
    };

    yield {
      type: "deck_ready",
      deck,
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      versionLabel: version.versionLabel,
      at: nowIso(),
    };

    const summary =
      ctx.mode === "pin-batch"
        ? pinBatchMeta && pinBatchMeta.succeededPinIds.length > 0
          ? `Processed annotations → ${version.versionLabel}: ${pinBatchMeta.succeededPinIds.length} ok, ${pinBatchMeta.failedPins.length} failed.`
          : `No annotations applied (${pinBatchMeta?.failedPins.length ?? 0} failed). Version unchanged.`
        : ctx.mode === "refine"
          ? `Refined deck to ${version.versionLabel} (${deck.slides.length} slides).`
          : `Composed “${deck.title}” with ${deck.slides.length} structured slides (${version.versionLabel}).`;

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
        versionId: version.versionId,
        versionNumber: version.versionNumber,
        versionLabel: version.versionLabel,
        summary,
        steps: [], // AgentRun fills authoritative step list
        pinBatch: pinBatchMeta,
        citations: deck.citations?.map((c) => ({
          id: c.id,
          title: c.title,
          excerpt: c.fileRef,
          source: c.url,
        })),
      },
      at: nowIso(),
    };

    yield {
      type: "run_status",
      status: "ready",
      at: nowIso(),
    };
  }

  private async *step(
    ctx: ProviderRunContext,
    tool: ToolName,
    target: string | undefined,
    body: (
      emit: {
        progress: (stepId: string, message: string) => ToolEvent;
      },
      stepId: string,
    ) => AsyncGenerator<ToolEvent, { summary: string; detail?: string }, unknown>,
  ): AsyncGenerator<ToolEvent, void, unknown> {
    const stepId = createId("step");
    const label = toolLabel(tool);
    const started = Date.now();

    yield {
      type: "tool_started",
      stepId,
      tool,
      label,
      target,
      at: nowIso(),
    };

    const emit = {
      progress: (id: string, message: string): ToolEvent => ({
        type: "tool_progress",
        stepId: id,
        message,
        at: nowIso(),
      }),
    };

    try {
      if (ctx.signal.aborted) throw abortError();
      const result = yield* body(emit, stepId);
      const durationMs = Date.now() - started;
      yield {
        type: "tool_completed",
        stepId,
        tool,
        label,
        summary: result.summary,
        durationMs,
        at: nowIso(),
      };
    } catch (err) {
      const durationMs = Date.now() - started;
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      yield {
        type: "tool_failed",
        stepId,
        tool,
        label,
        error: message,
        durationMs,
        at: nowIso(),
      };
      throw err;
    }
  }
}
