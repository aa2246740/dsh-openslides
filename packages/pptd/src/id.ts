/** Generate a stable unique id for PPTD entities. */
export function createId(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${rand.slice(0, 16)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
