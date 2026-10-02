/**
 * Compose a CompositionPlan from intent + selected recipe.
 * Deterministic geometry from recipe zones + type scale from contract.
 */

import { getFamily } from "./recipes.js";
import { getRecipeSpec } from "./recipe-catalog.js";
import type {
  ComposedElement,
  CompositionPlan,
  SlideDesignContract,
  SlideIntent,
} from "./schema.js";
import type { RecipeSelection } from "./schema.js";
import type { RecipeId } from "./recipes.js";

let elSeq = 0;
function eid(prefix: string): string {
  elSeq += 1;
  return `${prefix}-${elSeq}`;
}

function resetIds(): void {
  elSeq = 0;
}

/**
 * Build CompositionPlan. Does not touch PPTD — agent-core compiles plan → elements.
 */
export function composeSlide(
  intent: SlideIntent,
  contract: SlideDesignContract,
  selection: RecipeSelection,
): CompositionPlan {
  resetIds();
  const recipeId = selection.recipeId as RecipeId;
  const spec = getRecipeSpec(recipeId);
  if (!spec) {
    throw new Error(`Unknown recipe ${recipeId}`);
  }
  const family = getFamily(spec.family);
  const zones = spec.zones;
  const colors = contract.colors;
  const scale = contract.typeScale;
  const elements: ComposedElement[] = [];
  const rationale = [
    ...selection.rationale,
    `compose:${recipeId}`,
    `focus:${intent.focus.slice(0, 80)}`,
  ];

  const claimTitle = intent.claim || intent.title;
  const isDarkHero =
    recipeId === "cover-hero" || recipeId === "closing-next";

  // Background
  elements.push({
    id: eid("bg"),
    kind: "bg",
    role: "background",
    x: 0,
    y: 0,
    w: contract.canvas.width,
    h: contract.canvas.height,
    z: 0,
    fill: isDarkHero ? colors.primary || colors.background : colors.surface,
    shape: "rect",
  });

  if (zones.accentBar) {
    const ab = zones.accentBar;
    elements.push({
      id: eid("ab"),
      kind: "accent-bar",
      role: "accent",
      x: ab.x,
      y: ab.y,
      w: ab.w,
      h: ab.h,
      z: 1,
      fill: colors.accent,
      shape: "rect",
    });
  }

  // Title zone
  if (zones.title) {
    const tz = zones.title;
    const titleText =
      recipeId === "quote-focus"
        ? intent.quote || intent.subtitle || claimTitle
        : claimTitle;
    const role = tz.role;
    const fontKey =
      role === "display"
        ? "display"
        : role === "h1"
          ? "h1"
          : role === "h2"
            ? "h2"
            : role === "caption"
              ? "caption"
              : "h1";
    elements.push({
      id: eid("title"),
      kind: recipeId === "quote-focus" ? "quote" : "title",
      role: "title",
      x: tz.x,
      y: tz.y,
      w: tz.w,
      h: tz.h,
      z: 3,
      typeRole: fontKey,
      text: titleText,
    });
  }

  // Body / bullets
  if (
    zones.body &&
    (recipeId === "claim-bullets" ||
      recipeId === "closing-next" ||
      recipeId === "cover-hero" ||
      recipeId === "section-break")
  ) {
    const bz = zones.body;
    if (recipeId === "claim-bullets") {
      const bullets = (intent.bullets ?? intent.evidence ?? []).slice(
        0,
        spec.capacity.maxItems,
      );
      elements.push({
        id: eid("body"),
        kind: "body",
        role: "evidence",
        x: bz.x,
        y: bz.y,
        w: bz.w,
        h: bz.h,
        z: 3,
        typeRole: "body",
        text: bullets,
        bullet: true,
      });
    } else if (intent.subtitle || intent.bullets?.length) {
      elements.push({
        id: eid("body"),
        kind: recipeId === "closing-next" ? "body" : "subtitle",
        role: "supporting",
        x: bz.x,
        y: bz.y,
        w: bz.w,
        h: bz.h,
        z: 3,
        typeRole: recipeId === "closing-next" ? "body" : "h2",
        text: intent.bullets?.length
          ? intent.bullets.slice(0, 5)
          : intent.subtitle || "",
        bullet: Boolean(intent.bullets?.length),
      });
    }
  }

  // Two column
  if (recipeId === "two-column-compare") {
    const left = intent.left ?? intent.bullets?.slice(0, 3) ?? [];
    const right =
      intent.right ??
      intent.bullets?.slice(3) ??
      intent.evidence?.slice(0, 3) ??
      [];
    const leftZone = zones.body ?? { x: 100, y: 200, w: 820, h: 720, role: "body" as const };
    const rightZone = zones.media ?? { x: 1000, y: 200, w: 820, h: 720 };
    elements.push({
      id: eid("card-l"),
      kind: "card",
      role: "card-left",
      x: leftZone.x,
      y: leftZone.y,
      w: leftZone.w,
      h: leftZone.h,
      z: 1,
      fill: "#F7F8FA",
      shape: "roundRect",
    });
    elements.push({
      id: eid("card-r"),
      kind: "card",
      role: "card-right",
      x: rightZone.x,
      y: rightZone.y,
      w: rightZone.w,
      h: rightZone.h,
      z: 1,
      fill: "#F7F8FA",
      shape: "roundRect",
    });
    elements.push({
      id: eid("col-l"),
      kind: "body",
      role: "left",
      x: leftZone.x + 40,
      y: leftZone.y + 40,
      w: leftZone.w - 80,
      h: leftZone.h - 80,
      z: 3,
      typeRole: "body",
      text: left,
      bullet: true,
    });
    elements.push({
      id: eid("col-r"),
      kind: "body",
      role: "right",
      x: rightZone.x + 40,
      y: rightZone.y + 40,
      w: rightZone.w - 80,
      h: rightZone.h - 80,
      z: 3,
      typeRole: "body",
      text: right,
      bullet: true,
    });
  }

  // Chart
  if (recipeId === "chart-insight" && zones.media && intent.chart) {
    const mz = zones.media;
    elements.push({
      id: eid("chart"),
      kind: "chart",
      role: "evidence-chart",
      x: mz.x,
      y: mz.y,
      w: mz.w,
      h: mz.h,
      z: 3,
      chart: intent.chart,
    });
  }

  // Table
  if (recipeId === "table-matrix" && zones.media && intent.table) {
    const mz = zones.media;
    elements.push({
      id: eid("table"),
      kind: "table",
      role: "evidence-table",
      x: mz.x,
      y: mz.y,
      w: mz.w,
      h: mz.h,
      z: 3,
      table: intent.table,
    });
  }

  // Timeline
  if (recipeId === "timeline-milestones" && intent.timeline?.length) {
    const items = intent.timeline.slice(0, 6);
    const yLine = 520;
    elements.push({
      id: eid("tline"),
      kind: "accent-bar",
      role: "timeline-axis",
      x: 160,
      y: yLine,
      w: 1600,
      h: 8,
      z: 1,
      fill: colors.accent,
      shape: "rect",
    });
    const n = items.length;
    items.forEach((it, i) => {
      const cx = 160 + (i * 1600) / Math.max(n - 1, 1);
      elements.push({
        id: eid("dot"),
        kind: "marker",
        role: "milestone",
        x: cx - 20,
        y: yLine - 16,
        w: 40,
        h: 40,
        z: 3,
        fill: colors.accent,
        shape: "ellipse",
      });
      elements.push({
        id: eid("tl"),
        kind: "body",
        role: "milestone-label",
        x: Math.max(40, cx - 140),
        y: 280 + (i % 2) * 320,
        w: 300,
        h: 160,
        z: 3,
        typeRole: "body",
        text: [`${it.label}`, it.detail],
        bullet: false,
      });
    });
  }

  // Quote attribution
  if (recipeId === "quote-focus" && zones.footer) {
    const fz = zones.footer;
    elements.push({
      id: eid("attr"),
      kind: "footer",
      role: "attribution",
      x: fz.x,
      y: fz.y,
      w: fz.w,
      h: fz.h,
      z: 3,
      typeRole: "caption",
      text: intent.attribution || "",
    });
  }

  // Action footer
  if (
    intent.action &&
    zones.footer &&
    (recipeId === "claim-bullets" ||
      recipeId === "chart-insight" ||
      recipeId === "table-matrix" ||
      recipeId === "timeline-milestones")
  ) {
    const fz = zones.footer;
    elements.push({
      id: eid("action"),
      kind: "footer",
      role: "action",
      x: fz.x,
      y: fz.y,
      w: fz.w,
      h: fz.h,
      z: 3,
      typeRole: "caption",
      text: intent.action,
    });
  }

  // Cover footer (audience)
  if (recipeId === "cover-hero" && zones.footer && intent.subtitle) {
    // subtitle already in body; footer can carry brand line from notes
  }

  const hierarchy = ["background", "accent", "title", "evidence", "action"].filter(
    (h) => elements.some((e) => e.role === h || e.role.includes(h) || e.kind === h),
  );

  // Ensure hierarchy has title when present
  if (elements.some((e) => e.kind === "title" || e.kind === "quote") && !hierarchy.includes("title")) {
    hierarchy.unshift("title");
  }

  void family;
  void scale;

  return {
    recipeId,
    recipeFamily: spec.family,
    hierarchy: hierarchy.length ? hierarchy : ["title", "body"],
    elements,
    readingOrder: elements
      .filter((e) => e.kind !== "bg" && e.kind !== "card" && e.kind !== "accent-bar")
      .map((e) => e.id),
    overflowPolicy: "shrink-once",
    rationale,
    focus: intent.focus,
    role: intent.role,
  };
}
