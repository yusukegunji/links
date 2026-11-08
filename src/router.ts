import { useCallback, useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Minimal pathname router (no dependency). */
export function useLocation() {
  const raw = useSyncExternalStore(subscribe, () => window.location.pathname);
  const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  const go = useCallback((to: string) => navigate(to), []);
  return { path, search, navigate: go };
}
