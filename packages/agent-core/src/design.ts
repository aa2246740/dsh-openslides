/**
 * Design-brain integration → PPTD theme for compose.
 */

import {
  assembleDesignSystemPrompt,
  contractToThemeTokens,
  defaultConsultingContract,
  defaultConsultingTheme,
  toThemeTokens,
  type DesignContract,
} from "@open-slidestudio/design-brain";
import { DEFAULT_THEME, type ThemeTokens } from "@open-slidestudio/pptd";

export interface DesignAssembly {
  promptBlock: string;
  /** PPTD-compatible theme for Deck.theme */
  theme: ThemeTokens;
  contract?: DesignContract;
  source: "design-brain" | "fallback";
}

/**
 * Build design context for compose using design-brain contracts.
 */
export function assembleDesign(input: {
  prompt: string;
  templateId?: string;
  contractText?: string;
}): DesignAssembly {
  try {
    const base = defaultConsultingContract();
    const contract: DesignContract = {
      ...base,
      intent: input.prompt.slice(0, 800) || base.intent,
      brandNotes: [
        base.brandNotes,
        input.templateId ? `Template: ${input.templateId}` : undefined,
        input.contractText?.slice(0, 2000),
      ]
        .filter(Boolean)
        .join("\n"),
    };
    const promptBlock = assembleDesignSystemPrompt(contract);
    // design-brain ThemeTokens mirrors pptd Deck.theme
    const theme = contractToThemeTokens(contract) as ThemeTokens;
    return {
      promptBlock,
      theme,
      contract,
      source: "design-brain",
    };
  } catch {
    return {
      promptBlock: [
        "Design contract: Open SlideStudio presentation quality (fallback).",
        "Clarity-first. Prefer structured objects over decorative card grids.",
        `Brief: ${input.prompt.slice(0, 500)}`,
      ].join("\n"),
      theme: structuredClone(DEFAULT_THEME),
      source: "fallback",
    };
  }
}

export function fallbackTheme(): ThemeTokens {
  try {
    return toThemeTokens(defaultConsultingTheme()) as ThemeTokens;
  } catch {
    return structuredClone(DEFAULT_THEME);
  }
}
