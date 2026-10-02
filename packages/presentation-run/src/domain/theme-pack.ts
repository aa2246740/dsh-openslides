/**
 * Reference catalog: Host lists every source/visual; it does not pick a pack.
 * The agent adopts via commit_design adoptedSourceIds (or an explicit user pack).
 * Fail closed when that chosen pack's layout grammar disagrees with director kind,
 * when board-h1 / product-intro / academic / learn-share skip adopt (empty self-directed),
 * and when write_page paints a color that is not adopted PART B after a pack
 * is adopted (another pack's hex, or ungrounded host-default hex). Host does
 * not rebind Theme.colors.
 */
import fs from "node:fs";
import { classifyBriefKind, type BriefKind } from "./compose-ir.js";
import { listDesignSystems, resolveSkillRoot } from "./playbook.js";

export const KIND_THEME_PACK_ERROR = "kind_theme_pack";
export const MISSING_THEME_PACK_ERROR = "missing_theme_pack";
export const PACK_COLOR_ERROR = "pack_color";

const PACK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Hub tile slugs and numbered-catalog names that are not folder ids. */
const PACK_ALIASES: Record<string, string> = {
  "work/lead-grey": "work/warm-jade-annual-report",
  "work/lead-gray": "work/warm-jade-annual-report",
  "lead-grey": "work/warm-jade-annual-report",
  "lead-gray": "work/warm-jade-annual-report",
  "lead-gray-quarterly": "work/warm-jade-annual-report",
  "academic/meridian": "academic/paper-white-courseware",
  meridian: "academic/paper-white-courseware",
};

const NUMBERED_FAMILY: Record<string, string> = {
  "01_strategy": "consulting",
  "03_work": "work",
  "04_promotion": "promotion",
  "05_academic": "academic",
};

export type ChosenThemePack = {
  readonly id: string;
  readonly family: string;
};

export type KindThemePackIssue = {
  readonly code: typeof KIND_THEME_PACK_ERROR | typeof MISSING_THEME_PACK_ERROR;
  readonly kind: BriefKind;
  readonly packId?: string;
  readonly family?: string;
  readonly detail: string;
};

export type KindThemePackInput = {
  readonly brief: string;
  readonly designSystemId?: string;
  readonly adoptedSourceIds?: readonly string[];
  /** User named a pack (explicit-style). That pack is allowed; extra agent adopts are not. */
  readonly userExplicitPack?: boolean;
};

function canonicalizePackId(raw: string): string | undefined {
  const aliased = PACK_ALIASES[raw] || PACK_ALIASES[raw.split("/").pop() ?? ""];
  const wanted = aliased || raw;
  if (PACK_ID.test(wanted)) return wanted;
  return undefined;
}

/**
 * Parse a catalog source id, preview id, or group/slug into a canonical pack id.
 * SKILL.md, categories, and agent-self-directed-plan are not packs.
 */
export function parseThemePackId(raw: string): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s || s === "agent-self-directed-plan") return undefined;
  let body = s.replace(/\\/g, "/");
  if (body.startsWith("openkimi-preview:")) body = body.slice("openkimi-preview:".length);
  else if (body.startsWith("openkimi:")) body = body.slice("openkimi:".length);

  const direct = canonicalizePackId(body);
  if (direct) return direct;

  const designMd = body.match(/design_system\/([a-z0-9-]+)\/([a-z0-9-]+)\/design\.md$/i);
  if (designMd) return canonicalizePackId(`${designMd[1]}/${designMd[2]}`);

  const numbered = body.match(/design_system\/(\d{2}_[a-z0-9-]+)\/\d{2}\/en\/([a-z0-9-]+)\.md$/i);
  if (numbered) {
    const slug = numbered[2]!;
    const fromAlias = canonicalizePackId(slug);
    if (fromAlias) return fromAlias;
    const family = NUMBERED_FAMILY[numbered[1]!];
    if (family) return canonicalizePackId(`${family}/${slug}`);
  }
  return undefined;
}

export function themePackFamily(packId: string): string {
  return packId.split("/")[0] ?? "";
}

function joinKindName(kind: string, name: string): string[] {
  const family = kind.trim();
  const slug = name.trim();
  if (!family || !slug) return [];
  if (PACK_ID.test(slug)) return [slug];
  const numbered = NUMBERED_FAMILY[family];
  if (numbered) return [`${numbered}/${slug}`];
  return [`${family}/${slug}`];
}

/**
 * MiniMax wraps ids as `{ item: T }`, `{ items: T }`, `{ sourceId }`,
 * `{ id }`, `{ packId }`, or `{ kind, name }` (family/slug).
 * Empty objects and page ids such as `1_cover` are not packs.
 */
function unwrapSourceIds(value: unknown, depth = 0): string[] {
  if (depth > 8 || value == null) return [];
  if (typeof value === "string") {
    const s = value.trim();
    return s ? [s] : [];
  }
  if (Array.isArray(value)) return value.flatMap((row) => unwrapSourceIds(row, depth + 1));
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const out: string[] = [];
    if ("item" in rec) out.push(...unwrapSourceIds(rec.item, depth + 1));
    if ("items" in rec) out.push(...unwrapSourceIds(rec.items, depth + 1));
    if ("sourceId" in rec) out.push(...unwrapSourceIds(rec.sourceId, depth + 1));
    if ("packId" in rec) out.push(...unwrapSourceIds(rec.packId, depth + 1));
    if ("id" in rec) out.push(...unwrapSourceIds(rec.id, depth + 1));
    const kind = typeof rec.kind === "string" ? rec.kind : "";
    const name = typeof rec.name === "string" ? rec.name : "";
    if (kind && name) out.push(...joinKindName(kind, name));
    return out;
  }
  return [];
}

export function sourceIdList(...raw: unknown[]): string[] {
  return raw.flatMap((item) => unwrapSourceIds(item));
}

export function chosenThemePacksFrom(input: {
  designSystemId?: string;
  adoptedSourceIds?: readonly string[];
}): ChosenThemePack[] {
  const raw = [...(input.adoptedSourceIds ?? [])];
  const design = input.designSystemId?.trim();
  if (design) raw.unshift(design);
  const seen = new Set<string>();
  const out: ChosenThemePack[] = [];
  for (const item of raw) {
    const id = parseThemePackId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, family: themePackFamily(id) });
  }
  return out;
}

type ForbiddenFamily = { readonly family: string; readonly why: string };

/** Families that satisfy director kind. Undefined = empty adopt is allowed. */
export function requiredPackFamilies(kind: BriefKind): readonly string[] | undefined {
  if (kind === "board-h1" || kind === "product-intro") {
    return ["consulting", "finance", "promotion"];
  }
  if (kind === "performance-review" || kind === "work-report") {
    return ["work", "consulting"];
  }
  if (kind === "teaching" || kind === "training") {
    return ["academic", "consulting", "promotion"];
  }
  if (kind === "project-proposal") {
    return ["consulting", "finance", "work"];
  }
  if (kind === "learn-share") return ["consulting", "promotion"];
  if (kind === "academic") return ["academic"];
  return undefined;
}

function forbiddenFamilies(kind: BriefKind): readonly ForbiddenFamily[] {
  if (kind === "board-h1") {
    return [
      { family: "work", why: "澄光 monthly / 工作汇报 chrome" },
      { family: "academic", why: "课件/答辩 chrome" },
    ];
  }
  if (kind === "product-intro") {
    return [
      { family: "work", why: "经营月报 layouts" },
      { family: "academic", why: "课件/答辩 chrome" },
    ];
  }
  if (kind === "performance-review" || kind === "work-report") {
    return [
      { family: "academic", why: "courseware/academic-defense chrome" },
      { family: "promotion", why: "campaign chrome" },
    ];
  }
  if (kind === "teaching" || kind === "training") {
    return [
      { family: "work", why: "monthly/work-report chrome" },
      { family: "finance", why: "ledger chrome" },
    ];
  }
  if (kind === "project-proposal") {
    return [
      { family: "academic", why: "courseware/academic-defense chrome" },
      { family: "promotion", why: "campaign chrome without decision trade-offs" },
    ];
  }
  if (kind === "academic") {
    return [
      { family: "work", why: "澄光 monthly / 经营月报 chrome" },
      { family: "consulting", why: "strategy-report chrome" },
      { family: "finance", why: "ledger chrome" },
      { family: "promotion", why: "营销页 chrome" },
    ];
  }
  if (kind === "learn-share") {
    return [
      { family: "work", why: "澄光 monthly / 经营月报 chrome" },
      { family: "academic", why: "课件/答辩 chrome" },
      { family: "finance", why: "ledger chrome" },
    ];
  }
  return [];
}

export function kindThemePackDisagreement(
  kind: BriefKind,
  packs: readonly ChosenThemePack[],
): KindThemePackIssue | undefined {
  const forbidden = forbiddenFamilies(kind);
  if (!forbidden.length) return undefined;
  for (const pack of packs) {
    const hit = forbidden.find((row) => row.family === pack.family);
    if (!hit) continue;
    return {
      code: KIND_THEME_PACK_ERROR,
      kind,
      packId: pack.id,
      family: pack.family,
      detail: `Director kind ${kind} disagrees with theme pack ${pack.id} (${hit.why}). Host did not pick a preset. Choose a non-${pack.family} pack from the 76/44 catalog.`,
    };
  }
  return undefined;
}

export function kindThemePackIssue(input: KindThemePackInput): KindThemePackIssue | undefined {
  const kind = classifyBriefKind(input.brief);
  const explicitId =
    input.userExplicitPack === true ? parseThemePackId(input.designSystemId ?? "") : undefined;
  const packs = chosenThemePacksFrom({
    designSystemId: input.userExplicitPack === true ? undefined : input.designSystemId,
    adoptedSourceIds: input.adoptedSourceIds,
  }).filter((pack) => pack.id !== explicitId);
  const disagree = kindThemePackDisagreement(kind, packs);
  if (disagree) return disagree;
  if (explicitId) return undefined;
  const required = requiredPackFamilies(kind);
  if (!required) return undefined;
  const matching = packs.filter((pack) => required.includes(pack.family));
  if (matching.length) return undefined;
  const allowed = required.join("/");
  return {
    code: MISSING_THEME_PACK_ERROR,
    kind,
    detail: `Director kind ${kind} requires commit_design adoptedSourceIds of a matching ${allowed} pack from the 76/44 catalog before write_page. Empty adopt / agent-self-directed-plan is refused. Host did not pick a preset.`,
  };
}

/**
 * Official design.md PART B 【Color Palette】 hexes. Unprefixed RRGGBB is not
 * a Color Palette token. Empty when the pack has no PART B palette section.
 */
export function extractColorPaletteHexes(markdown: string): string[] {
  const start = markdown.search(/【Color Palette】/);
  if (start < 0) return [];
  const rest = markdown.slice(start);
  const next = rest.search(/\n【(?!Color Palette)/);
  const section = next >= 0 ? rest.slice(0, next) : rest.slice(0, 4000);
  const hexes = new Set<string>();
  for (const match of section.matchAll(/#([0-9A-Fa-f]{6})\b/g)) {
    hexes.add(`#${match[1]!.toUpperCase()}`);
  }
  return [...hexes];
}

export type PackColorWriteContext = {
  readonly adoptedPackId?: string;
  readonly adoptedPackHexes?: ReadonlySet<string>;
  readonly otherPackHexes?: ReadonlySet<string>;
};

let cachedCatalogPalettes: ReadonlyMap<string, ReadonlySet<string>> | undefined;
let cachedSkillRoot: string | undefined;

export function catalogPackPaletteHexes(): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, ReadonlySet<string>>();
  try {
    const skillRoot = resolveSkillRoot();
    if (cachedCatalogPalettes && cachedSkillRoot === skillRoot) return cachedCatalogPalettes;
    for (const sys of listDesignSystems(skillRoot)) {
      const markdown = fs.readFileSync(sys.file, "utf8");
      map.set(sys.id, new Set(extractColorPaletteHexes(markdown)));
    }
    cachedSkillRoot = skillRoot;
  } catch {
    // Missing resources can recover after install; never cache a failed lookup.
    return map;
  }
  cachedCatalogPalettes = map;
  return map;
}

export function packColorWriteContext(packIds: readonly string[]): PackColorWriteContext {
  const adopted = [...new Set(packIds.map((id) => id.trim()).filter(Boolean))];
  if (!adopted.length) return {};
  const catalog = catalogPackPaletteHexes();
  const adoptedPackHexes = new Set<string>();
  for (const id of adopted) {
    const hexes = catalog.get(id);
    if (!hexes) continue;
    for (const hex of hexes) adoptedPackHexes.add(hex);
  }
  if (!adoptedPackHexes.size) return {};
  const otherPackHexes = new Set<string>();
  const adoptedSet = new Set(adopted);
  for (const [id, hexes] of catalog) {
    if (adoptedSet.has(id)) continue;
    for (const hex of hexes) {
      if (!adoptedPackHexes.has(hex)) otherPackHexes.add(hex);
    }
  }
  return {
    adoptedPackId: adopted[0],
    adoptedPackHexes,
    otherPackHexes,
  };
}

export function packColorWriteContextFrom(input: {
  designSystemId?: string;
  adoptedSourceIds?: readonly string[];
}): PackColorWriteContext {
  return packColorWriteContext(chosenThemePacksFrom(input).map((pack) => pack.id));
}
