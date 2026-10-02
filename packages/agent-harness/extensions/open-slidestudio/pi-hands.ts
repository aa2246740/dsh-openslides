/**
 * Pi extension: OpenKimi produce tools (outline, pages, visual/structural check, compose).
 * Loaded with `pi --no-extensions -e <this file>`.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { buildPiImageContent } from "../../dist/pi-image-content.js";
import { TODO_EXHIBIT_KINDS } from "../../dist/layout-qa.js";
import { LAYOUT_FAMILIES } from "../../dist/design-contract.js";
import { DECK_TASTE_AXES } from "../../dist/run-ledger.js";

function resolveCli(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const built = path.resolve(here, "..", "..", "dist", "pi-hands-cli.js");
  if (fs.existsSync(built)) return built;
  throw new Error(`pi-hands-cli.js missing at ${built} — rebuild @open-slidestudio/agent-harness`);
}

type HandOutput = {
  ok: boolean;
  text: string;
  payload: Record<string, unknown>;
};

function runHand(
  name: string,
  params: Record<string, unknown>,
  cwd: string,
): HandOutput {
  const cli = resolveCli();
  const child = spawnSync(process.execPath, [cli, name, JSON.stringify(params)], {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
  const stdout = (child.stdout || "").trim();
  const stderr = (child.stderr || "").trim();
  let parsed: {
    ok?: boolean;
    detail?: string;
    summary?: string;
    payload?: Record<string, unknown>;
  } = {};
  try {
    parsed = stdout ? (JSON.parse(stdout) as { ok?: boolean; detail?: string; summary?: string }) : {};
  } catch {
    parsed = {};
  }
  const text = parsed.detail || parsed.summary || stdout || stderr || `${name} failed`;
  return {
    ok: child.status === 0 && parsed.ok !== false,
    text,
    payload:
      parsed.payload && typeof parsed.payload === "object" && !Array.isArray(parsed.payload)
        ? parsed.payload
        : {},
  };
}

function register(
  pi: ExtensionAPI,
  name: string,
  label: string,
  description: string,
  parameters: unknown,
  contextEpochId: string,
): void {
  pi.registerTool({
    name,
    label,
    description,
    parameters,
    executionMode: "sequential",
    prepareArguments(args) {
      const rec =
        args && typeof args === "object" ? { ...(args as Record<string, unknown>) } : {};
      if (typeof rec.elements === "string") {
        try {
          rec.elements = JSON.parse(rec.elements) as unknown;
        } catch {
          /* keep string; CLI will reject with keys */
        }
      }
      if (rec.elements && !Array.isArray(rec.elements) && typeof rec.elements === "object") {
        rec.elements = [rec.elements];
      }
      return rec;
    },
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const toolContext = { commandId: _id, contextEpochId };
      const callParams = {
        ...(params as Record<string, unknown>),
        __openSlideStudio: toolContext,
      };
      const result = runHand(name, callParams, ctx.cwd);
      if (!result.ok) throw new Error(result.text);
      if (
        name !== "render_page" &&
        name !== "view_design_reference" &&
        name !== "render_deck"
      ) {
        return { content: [{ type: "text", text: result.text }], details: result.payload };
      }

      const imageResult = buildPiImageContent(ctx.cwd, result.text, result.payload);
      const emitted = runHand(
        "_mark_image_emitted",
        { deliveryToken: imageResult.payload.deliveryToken, __openSlideStudio: toolContext },
        ctx.cwd,
      );
      if (!emitted.ok) throw new Error(emitted.text);
      return {
        content: [...imageResult.content],
        details: result.payload,
      };
    },
  });
}

export default function (pi: ExtensionAPI) {
  const contextEpochId = crypto.randomUUID();
  register(
    pi,
    "think",
    "Think",
    "Record audience, constraints, and what you will not invent. Call this first.",
    Type.Object({
      summary: Type.String(),
      detail: Type.String(),
    }),
    contextEpochId,
  );
  register(
    pi,
    "list_references",
    "List References",
    "List the complete original OpenKimi files and chunks required for this run. Read every unread chunk before write_todo.",
    Type.Object({}),
    contextEpochId,
  );
  register(
    pi,
    "read_reference",
    "Read Reference",
    "Return one exact, unabridged OpenKimi source chunk. No summary, truncation, or ellipsis is applied.",
    Type.Object({
      sourceId: Type.String(),
      chunkIndex: Type.Number(),
    }),
    contextEpochId,
  );
  register(
    pi,
    "view_design_reference",
    "View Design Reference",
    "Return the exact selected OpenKimi theme preview as image content. Inspect it before commit_design; local style hints do not replace it.",
    Type.Object({}),
    contextEpochId,
  );
  register(
    pi,
    "commit_design",
    "Commit Design",
    "Commit the task-specific, non-renderable design contract after reading every exact source and inspecting the selected preview. This freezes taste, hierarchy, layout-family planning, and anti-default rules before page production.",
    Type.Object({
      audience: Type.String(),
      scene: Type.String(),
      purpose: Type.String(),
      designRead: Type.String(),
      necessaryJudgment: Type.Object({
        removeOrDemote: Type.Array(Type.String(), { minItems: 1 }),
        mustRemain: Type.Array(Type.String(), { minItems: 1 }),
        inevitableRelationships: Type.Array(Type.String(), { minItems: 1 }),
      }),
      tasteDials: Type.Object({
        visualVariance: Type.Integer({ minimum: 1, maximum: 5 }),
        informationDensity: Type.Integer({ minimum: 1, maximum: 5 }),
        brandDistinction: Type.Integer({ minimum: 1, maximum: 5 }),
        typeExpressiveness: Type.Integer({ minimum: 1, maximum: 5 }),
        experimentRisk: Type.Integer({ minimum: 1, maximum: 5 }),
      }),
      typeSystem: Type.Object({
        personality: Type.String(),
        title: Type.String(),
        body: Type.String(),
        data: Type.String(),
        mixedScript: Type.String(),
      }),
      palette: Type.Object({
        background: Type.String(),
        text: Type.String(),
        primary: Type.String(),
        accent: Type.String(),
        neutral: Type.String(),
        areaRules: Type.Array(Type.String(), { minItems: 1 }),
      }),
      grid: Type.String(),
      densityRules: Type.Array(Type.String(), { minItems: 1 }),
      chartGrammar: Type.Array(Type.String(), { minItems: 1 }),
      visualMemory: Type.Object({
        feature: Type.String(),
        recurrence: Type.String(),
        avoid: Type.String(),
      }),
      referenceUse: Type.Object({
        adopt: Type.Array(Type.String(), { minItems: 1 }),
        adapt: Type.Array(Type.String(), { minItems: 1 }),
        doNotCopy: Type.Array(Type.String(), { minItems: 1 }),
      }),
      antiDefaultLocks: Type.Array(Type.String(), { minItems: 1 }),
      slidePlan: Type.Array(
        Type.Object({
          pageId: Type.String(),
          title: Type.String(),
          narrativeJob: Type.String(),
          layoutFamily: Type.Union(LAYOUT_FAMILIES.map((family) => Type.Literal(family))),
          focalPoint: Type.String(),
        }),
        { minItems: 2 },
      ),
      userOverrides: Type.Array(Type.Object({ quote: Type.String(), effect: Type.String() })),
    }),
    contextEpochId,
  );
  register(
    pi,
    "read_design",
    "Read Design",
    "Return the exact committed design contract to the current Pi context. Required after a context restart and before continuing the deck.",
    Type.Object({}),
    contextEpochId,
  );
  register(
    pi,
    "write_todo",
    "Write Todo",
    "Write the page outline. Required before pages. Each item needs a title, a note, and every editable exhibit the page must implement. Use none only when no exhibit is requested; prose cannot replace a chart, table, or diagram.",
    Type.Object({
      items: Type.Array(
        Type.Object({
          pageId: Type.String(),
          title: Type.String(),
          layoutFamily: Type.Union(LAYOUT_FAMILIES.map((family) => Type.Literal(family))),
          note: Type.String(),
          exhibits: Type.Array(
            Type.Union(TODO_EXHIBIT_KINDS.map((kind) => Type.Literal(kind))),
            { minItems: 1 },
          ),
        }),
      ),
    }),
    contextEpochId,
  );
  register(
    pi,
    "write_page",
    "Write Page",
    "Write ONE Pi-designed PPTD page. id and pageType must equal the committed slide-plan pageId and layoutFamily. Follow the selected design source and contract; do not default to card walls or a repeated page skeleton.",
    Type.Object(
      {
        id: Type.String(),
        pageType: Type.Optional(Type.String()),
        notes: Type.Optional(Type.String()),
        elements: Type.Array(Type.Any()),
      },
      { additionalProperties: true },
    ),
    contextEpochId,
  );
  register(
    pi,
    "render_page",
    "Render Page",
    "Screenshot native #slide for one written page. Call once per page the user will see (pageIndex 0..n-1). page-1.png alone is rejected.",
    Type.Object({
      pageId: Type.Optional(Type.String()),
      pageIndex: Type.Optional(Type.Number()),
    }),
    contextEpochId,
  );
  register(
    pi,
    "review_page",
    "Review Page",
    "Record your visual decision for the exact PNG just returned by render_page. A revise decision requires named issues. A pass decision requires an empty issues list.",
    Type.Object({
      pageId: Type.String(),
      revision: Type.Number(),
      deliveryToken: Type.String(),
      verdict: Type.Union([Type.Literal("pass"), Type.Literal("revise")]),
      issues: Type.Array(Type.String()),
    }),
    contextEpochId,
  );
  register(
    pi,
    "review_pages",
    "Review Pages",
    "Structural QA of written pages inside Pi (not official export_images.py). Call after pages exist, before compose_deck.",
    Type.Object({
      title: Type.Optional(Type.String()),
    }),
    contextEpochId,
  );
  register(
    pi,
    "render_deck",
    "Render Deck",
    "After every current page passes visual and structural review, return one full-deck overview in committed todo order. Inspect the actual overview before review_deck.",
    Type.Object({}),
    contextEpochId,
  );
  register(
    pi,
    "review_deck",
    "Review Deck",
    "Record a grounded full-deck taste decision against the exact overview and committed contract. Every axis needs visible observations, current page ids, and applicable contract rules. A pass cannot retain AI defaults or revision actions.",
    Type.Object({
      deliveryToken: Type.String(),
      verdict: Type.Union([Type.Literal("pass"), Type.Literal("revise")]),
      axes: Type.Array(
        Type.Object({
          axis: Type.Union(DECK_TASTE_AXES.map((axis) => Type.Literal(axis))),
          verdict: Type.Union([Type.Literal("pass"), Type.Literal("revise")]),
          observations: Type.Array(Type.String(), { minItems: 1 }),
          pageIds: Type.Array(Type.String(), { minItems: 1 }),
          contractRules: Type.Array(Type.String(), { minItems: 1 }),
        }),
        { minItems: DECK_TASTE_AXES.length, maxItems: DECK_TASTE_AXES.length },
      ),
      strongestPageId: Type.String(),
      weakestPageId: Type.String(),
      visualMemoryObserved: Type.String(),
      summary: Type.String(),
      remainingAiDefaults: Type.Array(Type.String()),
      revisionActions: Type.Array(Type.Object({ pageId: Type.String(), action: Type.String() })),
    }),
    contextEpochId,
  );
  register(
    pi,
    "search_image",
    "Search Image",
    "Only if capability.md says imageSearch=YES. Writes media/{id}. If the port is off, kind=none — use official no-image layouts.",
    Type.Object({
      id: Type.String(),
      query: Type.String(),
    }),
    contextEpochId,
  );
  register(
    pi,
    "generate_image",
    "Generate Image",
    "Only if capability.md says imageGenerate=YES. Prefer search_image first. If NO, do not call this — use official no-image layouts.",
    Type.Object({
      id: Type.String(),
      prompt: Type.String(),
      aspect: Type.Optional(Type.String()),
    }),
    contextEpochId,
  );
  register(
    pi,
    "compose_deck",
    "Compose Deck",
    "Finalize the deck from pages already written with write_page. Do not use this as a one-shot dump of the whole deck without write_todo and write_page first.",
    Type.Object({ title: Type.String() }),
    contextEpochId,
  );
}
