/** Small pure helpers for the agent harness. */

export function createId(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    if (signal?.aborted) {
      return Promise.reject(abortError());
    }
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function abortError(): Error {
  const err = new Error("Agent run cancelled");
  err.name = "AbortError";
  return err;
}

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.message === "Agent run cancelled")
  );
}

/** Derive a short deck title from a free-form prompt. */
export function titleFromPrompt(prompt: string, fallback = "Untitled Deck"): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  // Prefer first sentence / line, then cap length
  const first = cleaned.split(/[.\n!?]/)[0]?.trim() ?? cleaned;
  if (first.length <= 64) return first;
  return `${first.slice(0, 61).trimEnd()}…`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
