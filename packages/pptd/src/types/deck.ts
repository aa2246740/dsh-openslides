import type { Fill } from "./fill.js";
import type { Size, AspectRatio } from "./geometry.js";
import type { ThemeTokens } from "./theme.js";
import type { SlideElement } from "./elements.js";

export type ReferenceStatus =
  | "queued"
  | "uploading"
  | "parsing"
  | "parsed"
  | "unsupported"
  | "failed";

export type Reference = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  status: ReferenceStatus;
  url?: string;
  parsedSummary?: string;
};

export type Citation = {
  id: string;
  title: string;
  url?: string;
  fileRef?: string;
  accessedAt?: string;
  excerptHash?: string;
  claimIds?: string[];
};

export type Slide = {
  id: string;
  order: number;
  size: Size;
  background: Fill;
  elements: SlideElement[];
  notes?: string;
  /** Optional layout archetype hint (title, section, data, …) */
  layoutHint?: string;
};

export type Deck = {
  id: string;
  title: string;
  aspectRatio: AspectRatio;
  theme: ThemeTokens;
  slides: Slide[];
  references: Reference[];
  citations: Citation[];
  versionId: string;
  createdAt: string;
  updatedAt: string;
  meta?: Record<string, string>;
};
