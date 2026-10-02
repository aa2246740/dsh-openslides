/** Incremental text for Think / Plan / Compose NDJSON — not a one-shot dump. */

export type StreamTextOptions = {
  /** 0 = emit every chunk with no delay (tests). */
  paceMs?: number;
  /** Unicode characters per chunk. Newlines always flush. */
  chunkSize?: number;
};

export function chunkText(text: string, chunkSize = 4): string[] {
  const size = Math.max(1, chunkSize);
  const out: string[] = [];
  let buf = "";
  for (const ch of [...text]) {
    buf += ch;
    if (ch === "\n" || [...buf].length >= size) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

export async function streamText(
  text: string,
  onPartial: (partial: string) => void,
  opts: StreamTextOptions = {},
): Promise<void> {
  const chunks = chunkText(text, opts.chunkSize ?? 4);
  if (!chunks.length) {
    onPartial("");
    return;
  }
  let acc = "";
  const pace = Math.max(0, opts.paceMs ?? 0);
  for (const piece of chunks) {
    acc += piece;
    onPartial(acc);
    if (pace > 0) await new Promise((r) => setTimeout(r, pace));
  }
}
