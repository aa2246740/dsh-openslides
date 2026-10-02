import type { DesignContract } from "./contract.js";
import { defaultTypeScale } from "./defaults.js";

/**
 * Assemble a vendor-neutral design-system system prompt from a contract.
 * Suitable as a system or developer message for any chat/tool LLM.
 */
export function assembleDesignSystemPrompt(contract: DesignContract): string {
  const { tokens } = contract;
  const c = tokens.colors;
  const scale = contract.typeScale ?? defaultTypeScale();
  const margin = contract.slideMargin ?? 64;
  const gap = contract.gap ?? 24;

  const archetypeLines = contract.layoutArchetypes
    .map((a) => {
      const zones = a.zones
        .map(
          (z) =>
            `${z.role}@[${pct(z.x)},${pct(z.y)},${pct(z.w)},${pct(z.h)}]`,
        )
        .join(", ");
      return `- **${a.id}** (${a.name}): ${a.description} Zones: ${zones}. Prefer: ${a.preferredElements.join(", ") || "any"}.`;
    })
    .join("\n");

  const must = contract.antiSlopRules.filter((r) => r.severity === "must");
  const should = contract.antiSlopRules.filter((r) => r.severity === "should");
  const avoid = contract.antiSlopRules.filter((r) => r.severity === "avoid");

  const formatRules = (rules: typeof must) =>
    rules.map((r) => `- [${r.id}] ${r.rule}`).join("\n") || "- (none)";

  const chartPalette = c.chart.join(", ");
  const radii = tokens.radii ?? { sm: 8, md: 12, lg: 18 };

  const parts: string[] = [
    `# Design system contract — ${contract.name}`,
    ``,
    `You are composing **editable presentation structure** (PPTD elements), not bitmaps.`,
    `Follow this contract exactly. Do not invent a conflicting visual system.`,
    `Product context: DSH SlideStudio (multi-model). Never hardcode a single LLM vendor.`,
    ``,
    `## Intent`,
    contract.intent,
    ``,
    `## Audience`,
    contract.audience,
    ``,
    `## Density & motion`,
    `- Density: **${contract.density}**`,
    `- Motion: **${contract.motion}** (honor prefers-reduced-motion when describing UI chrome; slides themselves are static structure)`,
    ``,
    `## Color tokens`,
    `- background: ${c.background}`,
    `- surface: ${c.surface}`,
    `- ink: ${c.ink}`,
    `- muted: ${c.muted}`,
    `- accent: ${c.accent}`,
    `- primary: ${c.primary}`,
    `- secondary: ${c.secondary}`,
    c.border ? `- border: ${c.border}` : null,
    c.success || c.warning || c.danger
      ? `- success / warning / danger: ${c.success ?? "—"} / ${c.warning ?? "—"} / ${c.danger ?? "—"}`
      : null,
    `- chart series: ${chartPalette}`,
    ``,
    `## Typography`,
    `- heading font: ${tokens.fonts.heading}`,
    `- body font: ${tokens.fonts.body}`,
    tokens.fonts.mono ? `- mono: ${tokens.fonts.mono}` : null,
    `- sizes (px @ 1920×1080 ref): display ${scale.display}, h1 ${scale.h1}, h2 ${scale.h2}, h3 ${scale.h3}, body ${scale.body}, caption ${scale.caption}, footnote ${scale.footnote}`,
    ``,
    `## Spacing & shape`,
    `- base spacing unit: ${tokens.spacing ?? 8}px; slide margin: ${margin}px; gap: ${gap}px`,
    `- radii: sm ${radii.sm} / md ${radii.md} / lg ${radii.lg}`,
    ``,
    `## Layout archetypes`,
    `Pick one archetype per slide. Zone rects are normalized 0–1 (origin top-left).`,
    archetypeLines,
    ``,
    `## Anti-slop — MUST`,
    formatRules(must),
    ``,
    `## Anti-slop — SHOULD`,
    formatRules(should),
    ``,
    `## Anti-slop — AVOID`,
    formatRules(avoid),
  ].filter((line): line is string => line !== null);

  if (contract.brandNotes?.trim()) {
    parts.push(``, `## Brand notes`, contract.brandNotes.trim());
  }

  parts.push(
    ``,
    `## Output expectations for compose tools`,
    `- Produce structured slide elements with geometry, style mapped to tokens, and real chart/table data.`,
    `- Title = takeaway. Support claims with evidence zones.`,
    `- Keep cross-slide consistency: title y-position, margins, type scale, accent usage.`,
    `- Never replace a page with a single full-bleed decorative image unless archetype is full-bleed-image and the brief asks for it.`,
    `- Theme name: \`${tokens.name}\`. Contract version: ${contract.version}.`,
  );

  return parts.join("\n");
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

/**
 * Compact token block for tool arguments / logging (not a full system prompt).
 */
export function formatThemeTokensSummary(contract: DesignContract): string {
  const c = contract.tokens.colors;
  return [
    `${contract.name} v${contract.version}`,
    `ink=${c.ink} accent=${c.accent} bg=${c.background}`,
    `font=${contract.tokens.fonts.heading}`,
    `density=${contract.density}`,
    `archetypes=${contract.layoutArchetypes.map((a) => a.id).join(",")}`,
  ].join(" | ");
}
