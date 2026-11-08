import type { Link, LinkInput, Suggestion, TagCount } from "../shared/types";

const TOKEN_KEY = "links.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** Register a callback invoked whenever an authenticated request gets 401. */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

async function request<T>(path: string, init: RequestInit = {}, token = getToken(), handle401 = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && handle401) unauthorizedHandler?.();
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
}

export const api = {
  checkToken: (token: string) => request<{ ok: true }>("/auth/check", {}, token, false),
  listLinks: (params: { tags?: string[]; q?: string } = {}, signal?: AbortSignal) => {
    const sp = new URLSearchParams();
    if (params.tags?.length) sp.set("tags", params.tags.join(","));
    if (params.q?.trim()) sp.set("q", params.q.trim());
    const qs = sp.toString();
    return request<{ links: Link[] }>(`/links${qs ? `?${qs}` : ""}`, { signal }).then((r) => r.links);
  },
  createLink: (input: LinkInput) =>
    request<{ link: Link }>("/links", { method: "POST", body: JSON.stringify(input) }).then((r) => r.link),
  updateLink: (id: number, patch: Partial<LinkInput>) =>
    request<{ link: Link }>(`/links/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then((r) => r.link),
  deleteLink: (id: number) => request<void>(`/links/${id}`, { method: "DELETE" }),
  listTags: () => request<{ tags: TagCount[] }>("/tags").then((r) => r.tags),
  suggest: (url: string, signal?: AbortSignal) =>
    request<Suggestion>(`/suggest?url=${encodeURIComponent(url)}`, { signal }),
};
