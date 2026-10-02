/**
 * Image → editable nodes via a multimodal LLM (AC-11).
 *
 * The brain is the only vision capability; there is no separate OCR/VLM
 * service. Backends that cannot read images throw, and callers fall back
 * to the prompt-label path. Everything stays offline / configurable.
 */
import fs from "node:fs";
import path from "node:path";
import type { LlmPort } from "./llm-port.js";

export type RebuildNode = { text: string; role?: "title" | "node" | "caption" };

const SCHEMA = {
  title: "string, optional",
  nodes: [
    {
      text: "string, short node label",
      role: "title|node|caption, optional",
    },
  ],
};

export function imageToDataUrl(file: string): string {
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const mime =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".gif"
        ? "image/gif"
        : ext === ".webp"
          ? "image/webp"
          : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function parseNodes(raw: unknown): RebuildNode[] {
  if (!raw || typeof raw !== "object") return [];
  const nodes = (raw as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map((n) => {
      if (!n || typeof n !== "object") return null;
      const text = String((n as { text?: unknown }).text ?? "").trim();
      if (!text) return null;
      const role = (n as { role?: unknown }).role;
      return {
        text,
        role: role === "title" || role === "caption" ? role : "node",
      } as RebuildNode;
    })
    .filter((n): n is RebuildNode => Boolean(n))
    .slice(0, 12);
}

/**
 * Read an image into structured nodes. Throws when the backend cannot
 * read images or returns no nodes — the caller falls back.
 */
export async function rebuildNodesFromImage(
  llm: LlmPort,
  imagePath: string,
  hint?: string,
): Promise<RebuildNode[]> {
  if (!llm.completeJsonWithImages) throw new Error("LLM has no image input");
  const dataUrl = imageToDataUrl(imagePath);
  const system = [
    "You read a slide image and return its editable structure as JSON only.",
    "Extract visible text and the diagram structure. Do not invent content.",
    "Return short node labels in reading order; mark the top title if any.",
    "Schema:",
    JSON.stringify(SCHEMA),
  ].join("\n");
  const user = hint
    ? `Image attached. Optional user hint: ${hint}. Return the JSON object now.`
    : "Image attached. Return the JSON object now.";
  const raw = await llm.completeJsonWithImages(system, user, [{ url: dataUrl }]);
  const nodes = parseNodes(raw);
  if (!nodes.length) throw new Error("LLM returned no nodes for image");
  return nodes;
}
