import { inferTagsFromUrl } from "../shared/autoTags";
import { normalizeTags } from "../shared/tags";
import type { Suggestion } from "../shared/types";

const MAX_HTML_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const MAX_TITLE_LENGTH = 300;
const MAX_REDIRECTS = 3;
const MAX_TAG_LENGTH = 2048;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", copy: "©", reg: "®", trade: "™", mdash: "—", ndash: "–",
  laquo: "«", raquo: "»", middot: "·", bull: "•",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      const valid = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Parse attributes of a single start tag (linear time, handles mixed quotes). */
export function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const body = tag.replace(/^<[a-z]+/i, "").replace(/\/?>$/, "");
  for (const m of body.matchAll(re)) {
    attrs[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

/** Iterate `<name ...>` start tags with a bounded length, without backtracking regexes. */
function* startTags(html: string, name: string): Generator<string> {
  const lower = html.toLowerCase();
  const open = `<${name}`;
  let i = 0;
  while ((i = lower.indexOf(open, i)) !== -1) {
    const next = lower[i + open.length];
    if (next !== undefined && !/[\s/>]/.test(next)) {
      i += open.length;
      continue;
    }
    const end = lower.indexOf(">", i);
    if (end === -1) return;
    if (end - i <= MAX_TAG_LENGTH) yield html.slice(i, end + 1);
    i = end + 1;
  }
}

function clean(raw: string): string {
  return [...decodeEntities(raw).replace(/\s+/g, " ").trim()].slice(0, MAX_TITLE_LENGTH).join("");
}

export function extractTitle(html: string): string {
  for (const tag of startTags(html, "meta")) {
    const a = parseAttributes(tag);
    if ((a.property ?? a.name)?.toLowerCase() === "og:title" && a.content?.trim()) return clean(a.content);
  }
  for (const tag of startTags(html, "title")) {
    const lower = html.toLowerCase();
    const start = html.indexOf(tag) + tag.length;
    const end = lower.indexOf("</title", start);
    if (end !== -1) return clean(html.slice(start, end));
    break;
  }
  return "";
}

/** Detect charset from Content-Type, then <meta charset>, defaulting to UTF-8. */
export function detectCharset(contentType: string, head: Uint8Array): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  const ascii = new TextDecoder("latin1").decode(head.subarray(0, 4096));
  const fromMeta = /<meta[^>]{0,200}?charset=["']?([\w-]+)/i.exec(ascii)?.[1];
  const label = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  try {
    new TextDecoder(label);
    return label;
  } catch {
    return "utf-8";
  }
}

/** Refuse obvious internal targets. Workers cannot reach private networks, but be explicit. */
export function isFetchableUrl(u: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return false; // IP literals (v4/v6)
  return h.includes(".");
}

async function readLimited(res: Response, limit: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const buf = new Uint8Array(limit);
  let offset = 0;
  while (offset < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    const part = value.subarray(0, limit - offset);
    buf.set(part, offset);
    offset += part.length;
  }
  await reader.cancel().catch(() => {});
  return buf.subarray(0, offset);
}

/** Fetch following redirects manually so every hop is re-validated. */
async function safeFetch(url: URL, fetcher: typeof fetch, signal: AbortSignal): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isFetchableUrl(current)) return null;
    const res = await fetcher(current.toString(), {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; links-bot/1.0)" },
      redirect: "manual",
      signal,
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("Location");
      await res.body?.cancel();
      if (!location) return null;
      current = new URL(location, current);
      continue;
    }
    return res;
  }
  return null;
}

export async function fetchTitle(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  try {
    const res = await safeFetch(new URL(url), fetcher, AbortSignal.timeout(FETCH_TIMEOUT_MS));
    if (!res) return "";
    const contentType = res.headers.get("Content-Type") ?? "";
    if (!res.ok || !contentType.includes("html")) {
      await res.body?.cancel();
      return "";
    }
    const bytes = await readLimited(res, MAX_HTML_BYTES);
    return extractTitle(new TextDecoder(detectCharset(contentType, bytes)).decode(bytes));
  } catch {
    return "";
  }
}

export async function suggest(url: string, fetcher?: typeof fetch): Promise<Suggestion> {
  return { title: await fetchTitle(url, fetcher), tags: normalizeTags(inferTagsFromUrl(url)) };
}
