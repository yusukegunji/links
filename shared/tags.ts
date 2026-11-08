export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 50;

/** Trim, strip leading '#', lowercase, and collapse inner whitespace. Returns '' if invalid. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH);
}

/** Normalize, drop empties, de-duplicate (order preserved) and cap the count. */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const r of raw) {
    const t = normalizeTag(r);
    if (t && !seen.has(t)) seen.add(t);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}
