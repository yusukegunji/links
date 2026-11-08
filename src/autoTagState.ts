/**
 * Merge freshly inferred tags into the user's tag list.
 * - Tags previously added automatically but no longer inferred are removed.
 * - Tags the user explicitly removed (dismissed) are not re-added.
 * - Manually entered tags are always kept.
 */
export function mergeAutoTags(
  current: readonly string[],
  prevAuto: ReadonlySet<string>,
  inferred: readonly string[],
  dismissed: ReadonlySet<string>,
): { tags: string[]; auto: Set<string> } {
  const next = inferred.filter((t) => !dismissed.has(t));
  const nextSet = new Set(next);
  const kept = current.filter((t) => !prevAuto.has(t) || nextSet.has(t));
  const auto = new Set(next.filter((t) => prevAuto.has(t) || !current.includes(t)));
  const tags = [...kept, ...next.filter((t) => !kept.includes(t))];
  return { tags, auto };
}
