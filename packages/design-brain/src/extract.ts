import {
  defaultConsultingContract,
  defaultConsultingTheme,
} from "./defaults.js";
import type { DesignContract, DesignDensity } from "./contract.js";
import { withContractOverrides } from "./contract.js";
import {
  mergeThemeTokens,
  type PartialThemeTokens,
  type ThemeTokens,
} from "./theme-tokens.js";

export type ThemeHintExtraction = {
  /** Merged theme tokens (defaults filled in) */
  tokens: ThemeTokens;
  /** Only the fields inferred from text */
  partial: PartialThemeTokens;
  /** Detected density if any */
  density?: DesignDensity;
  /** Human-readable notes about what was matched */
  notes: string[];
  /** Confidence 0–1 heuristic */
  confidence: number;
};

const NAMED_COLORS: Record<string, string> = {
  black: "#111111",
  ink: "#111111",
  white: "#FFFFFF",
  ivory: "#FFFEF7",
  cream: "#F7F3EA",
  gray: "#6B6B6B",
  grey: "#6B6B6B",
  silver: "#B0B7C3",
  slate: "#4A5568",
  charcoal: "#2D2D2D",
  navy: "#0B3D5C",
  midnight: "#0A1628",
  blue: "#1F6B8A",
  azure: "#4D9CFF",
  sky: "#62A8E8",
  teal: "#0D7377",
  green: "#2F6F4E",
  forest: "#1B4D3E",
  moss: "#6B8F71",
  olive: "#6B7F3A",
  gold: "#C4A35A",
  amber: "#C47B3A",
  orange: "#D97706",
  coral: "#E07A5F",
  red: "#A33B3B",
  crimson: "#9B1B30",
  maroon: "#6B1E2A",
  purple: "#8B6B9E",
  violet: "#6D28D9",
  indigo: "#3730A3",
  pink: "#DB2777",
  rose: "#BE123C",
};

const FONT_PATTERNS: Array<{ re: RegExp; family: string }> = [
  { re: /\binter\b/i, family: "Inter, system-ui, sans-serif" },
  { re: /\broboto\b/i, family: "Roboto, system-ui, sans-serif" },
  { re: /\b(?:helvetica|arial)\b/i, family: "Helvetica, Arial, sans-serif" },
  {
    re: /\b(?:source sans|source sans 3)\b/i,
    family: "'Source Sans 3', system-ui, sans-serif",
  },
  {
    re: /\b(?:open sans)\b/i,
    family: "'Open Sans', system-ui, sans-serif",
  },
  {
    re: /\b(?:noto sans)\b/i,
    family: "'Noto Sans', system-ui, sans-serif",
  },
  {
    re: /\b(?:georgia|times)\b/i,
    family: "Georgia, 'Times New Roman', serif",
  },
  {
    re: /\b(?:ibm plex sans)\b/i,
    family: "'IBM Plex Sans', system-ui, sans-serif",
  },
  {
    re: /\b(?:dm sans)\b/i,
    family: "'DM Sans', system-ui, sans-serif",
  },
  {
    re: /\b(?:space grotesk)\b/i,
    family: "'Space Grotesk', system-ui, sans-serif",
  },
];

const HEX_RE = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g;

function expandHex(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  return `#${h.toUpperCase()}`;
}

function detectDensity(text: string): DesignDensity | undefined {
  const t = text.toLowerCase();
  if (
    /\b(sparse|airy|spacious|minimal|lots of whitespace|breathing room)\b/.test(
      t,
    )
  ) {
    return "sparse";
  }
  if (/\b(dense|compact|tight|high density|information dense)\b/.test(t)) {
    return "dense";
  }
  if (/\b(balanced|moderate density)\b/.test(t)) {
    return "balanced";
  }
  return undefined;
}

function detectNamedColorMentions(
  text: string,
): Array<{ name: string; hex: string }> {
  const found: Array<{ name: string; hex: string }> = [];
  const lower = text.toLowerCase();
  for (const [name, hex] of Object.entries(NAMED_COLORS)) {
    const re = new RegExp(`\\b${name}\\b`, "i");
    if (re.test(lower)) {
      found.push({ name, hex });
    }
  }
  return found;
}

type ScalarColorRole =
  | "accent"
  | "background"
  | "ink"
  | "muted"
  | "surface"
  | "primary"
  | "secondary"
  | "border";

function detectRoleHexAssignments(
  text: string,
): PartialThemeTokens["colors"] {
  const colors: Partial<Record<ScalarColorRole, string>> = {};
  const patterns: Array<{ role: ScalarColorRole; re: RegExp }> = [
    {
      role: "accent",
      re: /(?:accent|primary|brand)\s*(?:color|colour)?\s*[:=]?\s*(#[0-9A-Fa-f]{3,6})/i,
    },
    {
      role: "background",
      re: /(?:background|bg|stage)\s*(?:color|colour)?\s*[:=]?\s*(#[0-9A-Fa-f]{3,6})/i,
    },
    {
      role: "ink",
      re: /(?:ink|text|foreground|fg)\s*(?:color|colour)?\s*[:=]?\s*(#[0-9A-Fa-f]{3,6})/i,
    },
    {
      role: "muted",
      re: /(?:muted|secondary text)\s*(?:color|colour)?\s*[:=]?\s*(#[0-9A-Fa-f]{3,6})/i,
    },
    {
      role: "surface",
      re: /(?:surface|card)\s*(?:color|colour)?\s*[:=]?\s*(#[0-9A-Fa-f]{3,6})/i,
    },
  ];
  for (const { role, re } of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      colors[role] = expandHex(m[1]);
    }
  }
  return colors;
}

/**
 * Heuristic theme extraction from free-text briefs, brand notes, or
 * template descriptions. Offline-safe; no model calls.
 */
export function extractThemeFromHints(text: string): ThemeHintExtraction {
  const notes: string[] = [];
  const base = defaultConsultingTheme();
  const partial: PartialThemeTokens = {};
  let hits = 0;

  if (!text || !text.trim()) {
    return {
      tokens: base,
      partial: {},
      notes: ["empty hints — using default consulting theme"],
      confidence: 0,
    };
  }

  const hexes = [...text.matchAll(HEX_RE)].map((m) => expandHex(m[0]));
  const roleColors = detectRoleHexAssignments(text);
  if (roleColors && Object.keys(roleColors).length > 0) {
    partial.colors = { ...partial.colors, ...roleColors };
    // Keep primary in sync with ink/accent conventions when accent is set
    if (roleColors.accent && !roleColors.secondary) {
      partial.colors.secondary = roleColors.accent;
    }
    hits += Object.keys(roleColors).length;
    notes.push(
      `role-mapped hex: ${Object.entries(roleColors)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
  }

  // Unassigned hexes: first → accent, rest → chart series
  const used = new Set(
    Object.values(roleColors ?? {}).filter(
      (v): v is string => typeof v === "string",
    ),
  );
  const freeHexes = hexes.filter((h) => !used.has(h));
  if (freeHexes.length > 0) {
    partial.colors = partial.colors ?? {};
    if (!partial.colors.accent) {
      partial.colors.accent = freeHexes[0]!;
      partial.colors.secondary = freeHexes[0]!;
      notes.push(`accent from free hex: ${freeHexes[0]}`);
      hits += 1;
    }
    if (freeHexes.length > 1) {
      partial.colors.chart = freeHexes.slice(0, 7);
      notes.push(`chart palette from hex list (${freeHexes.length} colors)`);
      hits += 1;
    }
  }

  const named = detectNamedColorMentions(text);
  if (named.length > 0) {
    partial.colors = partial.colors ?? {};
    if (!partial.colors.accent) {
      const accentCandidate =
        named.find((n) =>
          /navy|blue|indigo|teal|midnight|azure|violet|purple|green|forest|crimson|maroon|gold|orange/.test(
            n.name,
          ),
        ) ?? named[0]!;
      partial.colors.accent = accentCandidate.hex;
      partial.colors.secondary = accentCandidate.hex;
      notes.push(`accent from named color "${accentCandidate.name}"`);
      hits += 1;
    }
    if (!partial.colors.background) {
      const bg = named.find((n) => /white|ivory|cream/.test(n.name));
      if (bg) {
        partial.colors.background = bg.hex;
        notes.push(`background from named color "${bg.name}"`);
        hits += 1;
      }
    }
    if (!partial.colors.ink) {
      const ink = named.find((n) => /black|ink|charcoal|midnight/.test(n.name));
      if (ink) {
        partial.colors.ink = ink.hex;
        partial.colors.primary = ink.hex;
        notes.push(`ink from named color "${ink.name}"`);
        hits += 1;
      }
    }
    if (!partial.colors.chart && named.length >= 2) {
      partial.colors.chart = named.slice(0, 7).map((n) => n.hex);
      notes.push("chart palette from named colors");
      hits += 1;
    }
  }

  for (const { re, family } of FONT_PATTERNS) {
    if (re.test(text)) {
      partial.fonts = {
        ...partial.fonts,
        heading: family,
        body: family,
      };
      notes.push(`font family: ${family.split(",")[0]}`);
      hits += 1;
      break;
    }
  }

  const lower = text.toLowerCase();
  if (/\b(finance|banking|fintech|investment)\b/.test(lower)) {
    partial.colors = {
      accent: "#0A2540",
      secondary: "#635BFF",
      primary: "#0A2540",
      ...partial.colors,
    };
    if (!partial.name) partial.name = "Finance";
    notes.push("domain preset: finance");
    hits += 1;
  } else if (/\b(academic|research paper|university|thesis)\b/.test(lower)) {
    partial.colors = {
      accent: "#1E3A5F",
      secondary: "#B08D57",
      ...partial.colors,
    };
    if (!partial.name) partial.name = "Academic";
    notes.push("domain preset: academic");
    hits += 1;
  } else if (/\b(promo|promotion|marketing|campaign|launch)\b/.test(lower)) {
    partial.colors = {
      accent: "#E11D48",
      secondary: "#F97316",
      ...partial.colors,
    };
    if (!partial.name) partial.name = "Promotion";
    notes.push("domain preset: promotion");
    hits += 1;
  } else if (
    /\b(consulting|strategy|board deck|partner deck)\b/.test(lower)
  ) {
    if (!partial.name) partial.name = "Consulting Classic";
    notes.push("domain preset: consulting (defaults retained)");
    hits += 1;
  }

  if (/\b(dark mode|dark theme|dark deck)\b/.test(lower)) {
    partial.colors = {
      background: "#0F1115",
      surface: "#1A1D24",
      ink: "#F3F4F6",
      primary: "#F3F4F6",
      muted: "#9CA3AF",
      border: "#2A2F3A",
      ...partial.colors,
    };
    notes.push("dark theme inversion");
    hits += 2;
  }

  const density = detectDensity(text);
  if (density) {
    notes.push(`density: ${density}`);
    hits += 1;
  }

  const tokens = mergeThemeTokens(base, partial);
  const confidence = Math.min(1, hits / 6);

  return {
    tokens,
    partial,
    density,
    notes,
    confidence,
  };
}

/**
 * Build a DesignContract from free-text hints, starting from consulting default.
 */
export function contractFromHints(text: string): DesignContract {
  const extraction = extractThemeFromHints(text);
  return withContractOverrides(defaultConsultingContract(), {
    tokens: extraction.partial,
    density: extraction.density,
    name: extraction.partial.name,
    brandNotes: extraction.notes.length
      ? `Extracted from hints: ${extraction.notes.join("; ")}`
      : undefined,
  });
}
