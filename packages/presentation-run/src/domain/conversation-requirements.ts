import fs from "node:fs";
import path from "node:path";
import { requestedPageCountFromBrief } from "./compose-ir.js";

/** Only accepted creation turns may update the deck's requested total. Edits and
 * discussion can mention page numbers without changing the generation contract. */
export function conversationPageCount(root: string): number | undefined {
  const file = path.join(root, "_agent", "assistant-conversation.v1.json");
  if (!fs.existsSync(file)) return undefined;
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as { version?: unknown; messages?: unknown };
  if (value.version !== 1 || !Array.isArray(value.messages)) throw new Error("Invalid assistant conversation record");
  for (const message of [...value.messages].reverse()) {
    if (message?.mode !== "generate" || typeof message.text !== "string") continue;
    const text = message.text.trim();
    // Incremental additions are not a new total; the canonical page plan handles them.
    if (/(?:增加|新增|追加|补充|再加|加上|加|减|删|去掉)\s*[0-9零〇一二两三四五六七八九十百]+\s*页/.test(text)) continue;
    // A lone digit is ambiguous (e.g. a plan choice) and never rewrites the total.
    const count = requestedPageCountFromBrief(text);
    if (count !== undefined) return count;
  }
  return undefined;
}
