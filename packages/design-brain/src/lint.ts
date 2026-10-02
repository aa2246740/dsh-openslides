/**
 * Post-compile geometric + taste lint on CompositionPlan / deck-level meta.
 * Checkable anti-slop rules (inspired by open-design craft, written for PPTD).
 */

import type {
  CompositionPlan,
  QualityIssue,
  QualityReport,
  SlideDesignContract,
} from "./schema.js";

const FORBIDDEN_ACCENTS = new Set(
  [
    "#6366f1",
    "#4f46e5",
    "#4338ca",
    "#3730a3",
    "#8b5cf6",
    "#7c3aed",
    "#a855f7",
  ].map((s) => s.toLowerCase()),
);

export type LintableSlide = {
  plan: CompositionPlan;
  /** Approximate body font size used (px) */
  bodyFontPx?: number;
  titleText?: string;
};

export function lintCompositionPlans(
  slides: LintableSlide[],
  contract: SlideDesignContract,
): QualityReport {
  const errors: QualityIssue[] = [];
  const warnings: QualityIssue[] = [];
  const { width: W, height: H } = contract.canvas;
  const margin = contract.qualityThresholds.safeMarginPx;
  const minBody = contract.qualityThresholds.minBodyPx;
  const maxStreak = contract.qualityThresholds.maxSameRecipeStreak;
  const maxTitle = contract.qualityThresholds.maxTitleChars;

  // Theme anti-indigo
  if (FORBIDDEN_ACCENTS.has(contract.colors.accent.toLowerCase())) {
    errors.push({
      code: "accent-indigo-slop",
      severity: "error",
      message: `Accent ${contract.colors.accent} is a default AI indigo — use contract accent`,
      repairable: true,
    });
  }

  let streak = 0;
  let prevRecipe = "";

  slides.forEach((s, i) => {
    const plan = s.plan;

    // Recipe streak
    if (plan.recipeId === prevRecipe) {
      streak += 1;
    } else {
      streak = 1;
      prevRecipe = plan.recipeId;
    }
    if (streak > maxStreak) {
      warnings.push({
        code: "recipe-streak",
        severity: "warning",
        slideIndex: i,
        message: `Recipe ${plan.recipeId} repeated ${streak} times (max ${maxStreak})`,
        repairable: true,
      });
    }

    // Geometry bounds
    for (const el of plan.elements) {
      if (el.kind === "bg") continue;
      if (el.x < -2 || el.y < -2 || el.x + el.w > W + 2 || el.y + el.h > H + 2) {
        errors.push({
          code: "geometry-oob",
          severity: "error",
          slideIndex: i,
          message: `Element ${el.id} out of 1920×1080 bounds`,
          repairable: true,
        });
      }
      if (
        el.kind !== "accent-bar" &&
        (el.x < margin - 40 || el.x + el.w > W - (margin - 40))
      ) {
        // accent bars may sit on edge; others should respect soft margin
        if (el.x === 0 && el.w < 40) {
          // left rail accent — ok
        } else if (el.y === 0 && el.h < 20) {
          // top bar — ok
        } else if (el.kind === "card" || el.kind === "body" || el.kind === "title") {
          // only warn soft
        }
      }
      if (el.w <= 0 || el.h <= 0) {
        errors.push({
          code: "zero-size",
          severity: "error",
          slideIndex: i,
          message: `Element ${el.id} has non-positive size`,
          repairable: false,
        });
      }
    }

    // Focus: must have title or quote
    const hasFocus = plan.elements.some(
      (e) => e.kind === "title" || e.kind === "quote" || e.role === "title",
    );
    if (!hasFocus) {
      errors.push({
        code: "missing-focus",
        severity: "error",
        slideIndex: i,
        message: "Slide has no title/quote focus element",
        repairable: false,
      });
    }

    // Title length
    const titleEl = plan.elements.find((e) => e.kind === "title" || e.kind === "quote");
    const titleText =
      s.titleText ||
      (typeof titleEl?.text === "string"
        ? titleEl.text
        : Array.isArray(titleEl?.text)
          ? titleEl.text.join(" ")
          : "");
    if (titleText.length > maxTitle) {
      warnings.push({
        code: "title-long",
        severity: "warning",
        slideIndex: i,
        message: `Title length ${titleText.length} > ${maxTitle}`,
        repairable: true,
      });
    }

    // Empty generic titles (EN + common CN slop)
    if (
      /^(overview|introduction|agenda|summary|untitled|contents?)$/i.test(
        titleText.trim(),
      ) ||
      /^(概述|简介|目录|总结|内容|封面|议程|结束)$/.test(titleText.trim())
    ) {
      warnings.push({
        code: "generic-title",
        severity: "warning",
        slideIndex: i,
        message: `Generic title "${titleText}" — prefer a claim`,
        repairable: true,
      });
    }

    // Body font floor
    if (s.bodyFontPx != null && s.bodyFontPx < minBody) {
      errors.push({
        code: "font-too-small",
        severity: "error",
        slideIndex: i,
        message: `Body font ${s.bodyFontPx}px < min ${minBody}px`,
        repairable: true,
      });
    }

    // Decorative card wall without content
    const cards = plan.elements.filter((e) => e.kind === "card");
    if (cards.length >= 2) {
      const bodies = plan.elements.filter((e) => e.kind === "body");
      const empty = bodies.every((b) => {
        if (!b.text) return true;
        if (Array.isArray(b.text)) return b.text.length === 0;
        return !String(b.text).trim();
      });
      if (empty) {
        warnings.push({
          code: "empty-cards",
          severity: "warning",
          slideIndex: i,
          message: "Card layout with empty evidence — decorative slop risk",
          repairable: true,
        });
      }
    }

    // Thesis without evidence
    if (
      plan.role === "thesis" &&
      !plan.elements.some(
        (e) =>
          e.kind === "body" ||
          e.kind === "chart" ||
          e.kind === "table" ||
          e.role === "evidence",
      )
    ) {
      warnings.push({
        code: "thesis-no-evidence",
        severity: "warning",
        slideIndex: i,
        message: "Thesis slide has claim but no evidence block",
        repairable: true,
      });
    }
  });

  const errorWeight = errors.length * 18;
  const warnWeight = warnings.length * 6;
  const score = Math.max(0, Math.min(100, 100 - errorWeight - warnWeight));

  return {
    score,
    errors,
    warnings,
    repairable: errors.some((e) => e.repairable) || warnings.some((w) => w.repairable),
  };
}

/** Compact summary for agent step detail */
export function formatQualityReport(report: QualityReport): string {
  const lines = [
    `score=${report.score}`,
    ...report.errors.map((e) => `E[${e.code}] slide=${e.slideIndex ?? "-"} ${e.message}`),
    ...report.warnings.map((w) => `W[${w.code}] slide=${w.slideIndex ?? "-"} ${w.message}`),
  ];
  return lines.join("\n");
}
