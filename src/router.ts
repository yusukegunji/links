import { useCallback, useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}

export function navigate(to: string, { replace = false }: { replace?: boolean } = {}) {
  if (to === window.location.pathname + window.location.search) return;
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function buildSearch({ tags, q }: { tags: string[]; q: string }): string {
  const sp = new URLSearchParams();
  if (tags.length) sp.set("tags", tags.join(","));
  if (q) sp.set("q", q); // not trimmed: keeps trailing spaces while typing
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Minimal pathname router (no dependency). */
export function useLocation() {
  const raw = useSyncExternalStore(subscribe, () => window.location.pathname);
  const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  const go = useCallback((to: string, opts?: { replace?: boolean }) => navigate(to, opts), []);
  return { path, search, navigate: go };
}
