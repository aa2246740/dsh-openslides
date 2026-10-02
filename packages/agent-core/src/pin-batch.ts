/**
 * Agent annotation pins — work orders for the agent (not human discussion threads).
 * Batch process: apply open pins → new version only when ≥1 pin succeeds.
 * Failures keep id + reason; no full-deck auto-rollback.
 */

import {
  deepClone,
  type ChartElement,
  type Deck,
  type Slide,
  type SlideElement,
  type SmartArtElement,
  type TextElement,
} from "@open-slidestudio/pptd";
import { nextVersion, type VersionStamp } from "./version.js";

export type AgentPin = {
  id: string;
  slideId: string;
  /**
   * Slide-local coordinates from the canvas.
   * If both x and y are in [0, 1], treated as normalized; otherwise pixels.
   */
  x: number;
  y: number;
  /** Change instruction for the agent */
  text: string;
};

export type PinFailure = {
  id: string;
  reason: string;
};

export type PinBatchApplyResult = {
  /** Deck after successful pin edits (or deep clone of base if none succeeded) */
  deck: Deck;
  /** Present only when versionBumped */
  version: VersionStamp | null;
  versionBumped: boolean;
  succeededPinIds: string[];
  failedPins: PinFailure[];
};

/**
 * Build a single refine prompt from open pins (for LLM narrative / logs).
 */
export function formatPinBatchInstruction(pins: AgentPin[]): string {
  const lines = pins.map((p, i) => {
    const pos = `(${p.x}, ${p.y})`;
    return `${i + 1}. [pin ${p.id}] slide=${p.slideId} @ ${pos}: ${p.text.trim()}`;
  });
  return [
    "Process all agent annotations as scoped edits. Edit only relevant regions/objects near each pin.",
    "Do not regenerate the whole deck. Do not roll back the deck on partial failure.",
    "",
    ...lines,
  ].join("\n");
}

export function resolvePinPoint(
  slide: Slide,
  pin: Pick<AgentPin, "x" | "y">,
): { px: number; py: number; W: number; H: number } {
  const W = slide.size?.width > 0 ? slide.size.width : 1920;
  const H = slide.size?.height > 0 ? slide.size.height : 1080;
  // Canvas sends absolute px (often ≫ 1). Only treat as normalized when both in (0,1].
  // (0,0) is top-left in either space — treat as absolute px 0,0.
  const useNorm =
    pin.x > 0 && pin.x <= 1 && pin.y > 0 && pin.y <= 1;
  const px = useNorm ? pin.x * W : Math.min(W, Math.max(0, pin.x));
  const py = useNorm ? pin.y * H : Math.min(H, Math.max(0, pin.y));
  return { px, py, W, H };
}

function elementCenter(el: SlideElement): { cx: number; cy: number } {
  return { cx: el.x + el.width / 2, cy: el.y + el.height / 2 };
}

function dist2(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function nearestOfKind<T extends SlideElement>(
  slide: Slide,
  px: number,
  py: number,
  kind: T["kind"],
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const el of slide.elements) {
    if (el.kind !== kind) continue;
    const { cx, cy } = elementCenter(el);
    const d = dist2(cx, cy, px, py);
    if (d < bestD) {
      bestD = d;
      best = el as T;
    }
  }
  return best;
}

function setTextContent(el: TextElement, text: string, ink?: string): void {
  const base = el.paragraphs[0]?.runs[0];
  el.paragraphs = [
    {
      runs: [
        {
          text: text.slice(0, 500),
          fontSize: base?.fontSize ?? 22,
          fontWeight: base?.fontWeight ?? 400,
          color: ink ?? base?.color,
        },
      ],
    },
  ];
}

function extractReplacement(instruction: string): string | null {
  const m = instruction.match(
    /(?:改标题|标题改为|改为|改成|换成|change title to|title:\s*|change to|set to|replace with)\s*[:：]?\s*(.+)/i,
  );
  return m?.[1]?.trim() ? m[1].trim().slice(0, 200) : null;
}

function wantsAppend(instruction: string): boolean {
  return /补充|追加|add\b|append\b/i.test(instruction);
}

/**
 * Deterministic application of pin work orders.
 * Only bumps version when at least one pin succeeds.
 */
export function applyPinBatchToDeck(
  base: Deck,
  pins: AgentPin[],
  version?: VersionStamp,
): PinBatchApplyResult {
  const deck = deepClone(base);
  const now = new Date().toISOString();
  const succeededPinIds: string[] = [];
  const failedPins: PinFailure[] = [];
  const appliedSummaries: string[] = [];

  for (const pin of pins) {
    const text = pin.text?.trim() ?? "";
    if (!text) {
      failedPins.push({ id: pin.id, reason: "Empty annotation instruction" });
      continue;
    }
    const slide = deck.slides.find((s) => s.id === pin.slideId);
    if (!slide) {
      failedPins.push({
        id: pin.id,
        reason: `Slide not found: ${pin.slideId}`,
      });
      continue;
    }

    try {
      const summary = applyOnePin(slide, pin, deck.theme.colors.ink);
      appliedSummaries.push(`#${pin.id}: ${summary}`);
      succeededPinIds.push(pin.id);
    } catch (err) {
      failedPins.push({
        id: pin.id,
        reason: err instanceof Error ? err.message : "Apply failed",
      });
    }
  }

  if (succeededPinIds.length === 0) {
    // No version bump, no meta rewrite beyond failure log on a clone of base
    const untouched = deepClone(base);
    untouched.meta = {
      ...(untouched.meta ?? {}),
      lastPinBatchAt: now,
      lastPinBatchOk: "0",
      lastPinBatchFail: String(failedPins.length),
      lastPinBatchSummary: failedPins.map((f) => `${f.id}:${f.reason}`).join("; ").slice(0, 500),
    };
    return {
      deck: untouched,
      version: null,
      versionBumped: false,
      succeededPinIds: [],
      failedPins,
    };
  }

  const stamp =
    version ?? nextVersion(Number(base.meta?.versionNumber) || 1);
  deck.versionId = stamp.versionId;
  deck.updatedAt = now;
  deck.meta = {
    ...(deck.meta ?? {}),
    versionNumber: String(stamp.versionNumber),
    versionLabel: stamp.versionLabel,
    lastPinBatchAt: now,
    lastPinBatchOk: String(succeededPinIds.length),
    lastPinBatchFail: String(failedPins.length),
    lastPinBatchSummary: appliedSummaries.join(" · ").slice(0, 500),
  };

  return {
    deck,
    version: stamp,
    versionBumped: true,
    succeededPinIds,
    failedPins,
  };
}

function applyOnePin(slide: Slide, pin: AgentPin, ink: string): string {
  const { px, py, W, H } = resolvePinPoint(slide, pin);
  const instruction = pin.text.trim();
  const replacement = extractReplacement(instruction);

  // 1) Title-style / explicit replace on large text or nearest text
  const titleEl = slide.elements.find(
    (e): e is TextElement =>
      e.kind === "text" &&
      e.paragraphs.some((p) => (p.runs[0]?.fontSize ?? 0) >= 28),
  );
  if (replacement && titleEl && /标题|title/i.test(instruction)) {
    setTextContent(titleEl, replacement, ink);
    slide.notes = [slide.notes, `Pin ${pin.id}: title → ${replacement}`]
      .filter(Boolean)
      .join("\n");
    return `title→${replacement.slice(0, 40)}`;
  }

  // 2) Chart near pin — update first series first value if numbers present
  const chart = nearestOfKind<ChartElement>(slide, px, py, "chart");
  if (chart && /数字|数据|value|chart|series|指标/i.test(instruction)) {
    const nums = instruction.match(/-?\d+(\.\d+)?/g)?.map(Number).filter((n) => Number.isFinite(n));
    if (nums?.length && chart.series[0]) {
      const values = [...chart.series[0].values];
      for (let i = 0; i < Math.min(nums.length, values.length); i++) {
        values[i] = nums[i]!;
      }
      chart.series = chart.series.map((s, idx) =>
        idx === 0 ? { ...s, values } : s,
      );
      slide.notes = [slide.notes, `Pin ${pin.id}: chart values updated`]
        .filter(Boolean)
        .join("\n");
      return `chart values @ (${Math.round(px)},${Math.round(py)})`;
    }
  }

  // 3) SmartArt near pin — update nearest node text
  const smart = nearestOfKind<SmartArtElement>(slide, px, py, "smartart");
  if (smart && smart.nodes.length > 0) {
    const nodeText = replacement || instruction.slice(0, 80);
    // Pick node by vertical proximity within smartart bounds
    let nodeIdx = 0;
    let best = Infinity;
    smart.nodes.forEach((n, i) => {
      const ny = smart.y + ((i + 0.5) * smart.height) / smart.nodes.length;
      const d = Math.abs(ny - py);
      if (d < best) {
        best = d;
        nodeIdx = i;
      }
    });
    if (/节点|node|步骤|改/i.test(instruction) || replacement || best < smart.height) {
      smart.nodes = smart.nodes.map((n, i) =>
        i === nodeIdx ? { ...n, text: nodeText } : n,
      );
      slide.notes = [slide.notes, `Pin ${pin.id}: smartart node ${nodeIdx}`]
        .filter(Boolean)
        .join("\n");
      return `smartart node ${nodeIdx}`;
    }
  }

  // 4) Nearest text object — primary scoped edit
  const textEl = nearestOfKind<TextElement>(slide, px, py, "text");
  if (textEl) {
    const prev =
      textEl.paragraphs[0]?.runs.map((r) => r.text).join("") ?? "";
    if (wantsAppend(instruction)) {
      const add = replacement || instruction.replace(/^(补充|追加|add|append)\s*[:：]?\s*/i, "");
      setTextContent(textEl, `${prev} ${add}`.trim(), ink);
      slide.notes = [slide.notes, `Pin ${pin.id}: append text`]
        .filter(Boolean)
        .join("\n");
      return `append text @ (${Math.round(px)},${Math.round(py)})`;
    }
    const next = replacement || instruction;
    setTextContent(textEl, next, ink);
    slide.notes = [
      slide.notes,
      `Pin ${pin.id}: text “${prev.slice(0, 40)}” → “${next.slice(0, 40)}”`,
    ]
      .filter(Boolean)
      .join("\n");
    return `edit text @ (${Math.round(px)},${Math.round(py)})`;
  }

  // 5) No text target — fail rather than sticker spam (honest)
  throw new Error(
    `No editable object near (${Math.round(px)},${Math.round(py)}) on slide ${slide.id} (${W}×${H})`,
  );
}
