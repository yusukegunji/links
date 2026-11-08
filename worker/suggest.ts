import { inferTagsFromUrl } from "../shared/autoTags";
import { normalizeTags } from "../shared/tags";
import type { Suggestion } from "../shared/types";

const MAX_HTML_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const MAX_TITLE_LENGTH = 300;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function metaContent(html: string, key: string): string | null {
  // Matches <meta property|name="key" content="..."> in either attribute order.
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i");
  return re1.exec(html)?.[1] ?? re2.exec(html)?.[1] ?? null;
}

export function extractTitle(html: string): string {
  const raw = metaContent(html, "og:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  return [...decodeEntities(raw).replace(/\s+/g, " ").trim()].slice(0, MAX_TITLE_LENGTH).join("");
}

/** Refuse obvious internal targets. Workers cannot reach private networks, but be explicit. */
export function isFetchableHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return false; // IP literals (v4/v6)
  return h.includes(".");
}

async function readLimited(res: Response, limit: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const c of chunks) {
    const part = c.subarray(0, buf.length - offset);
    buf.set(part, offset);
    offset += part.length;
    if (offset >= buf.length) break;
  }
  return new TextDecoder().decode(buf);
}

export async function fetchTitle(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  const u = new URL(url);
  if (!isFetchableHost(u.hostname)) return "";
  try {
    const res = await fetcher(u.toString(), {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "links-bot/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok || !(res.headers.get("Content-Type") ?? "").includes("html")) {
      await res.body?.cancel();
      return "";
    }
    return extractTitle(await readLimited(res, MAX_HTML_BYTES));
  } catch {
    return "";
  }
}

export async function suggest(url: string, fetcher?: typeof fetch): Promise<Suggestion> {
  return { title: await fetchTitle(url, fetcher), tags: normalizeTags(inferTagsFromUrl(url)) };
}
