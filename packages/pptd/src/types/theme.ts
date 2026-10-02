/** Theme tokens consumed by compose tools and the design-brain package. */

export type ThemeColors = {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  primary: string;
  secondary: string;
  success?: string;
  danger?: string;
  /** Ordered palette for chart series */
  chart: string[];
};

export type ThemeFonts = {
  heading: string;
  body: string;
  mono?: string;
};

export type ThemeRadii = {
  sm: number;
  md: number;
  lg: number;
};

export type ThemeTokens = {
  name: string;
  colors: ThemeColors;
  fonts: ThemeFonts;
  radii?: ThemeRadii;
  /** Base spacing unit in px */
  spacing?: number;
};

export const DEFAULT_THEME: ThemeTokens = {
  name: "DSH SlideStudio Neutral",
  colors: {
    background: "#F6F6F6",
    surface: "#FFFFFF",
    ink: "#111111",
    muted: "#777777",
    accent: "#4D9CFF",
    primary: "#111111",
    secondary: "#4D9CFF",
    success: "#2F7A45",
    danger: "#C64545",
    chart: ["#4D9CFF", "#62A8E8", "#2F7A45", "#E8A838", "#C64545", "#7B6CF0"],
  },
  fonts: {
    heading: "Inter, system-ui, sans-serif",
    body: "Inter, system-ui, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  radii: { sm: 8, md: 12, lg: 18 },
  spacing: 8,
};
