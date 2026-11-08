/**
 * Infer tags from a URL alone (no network). Shared by the client (instant
 * suggestions while typing) and the worker (/api/suggest).
 */

interface DomainRule {
  /** Hostname suffixes to match (e.g. "github.com" matches "gist.github.com"). */
  hosts: string[];
  tags: string[];
}

const DOMAIN_RULES: DomainRule[] = [
  { hosts: ["github.com", "github.io"], tags: ["github", "code"] },
  { hosts: ["gitlab.com"], tags: ["gitlab", "code"] },
  { hosts: ["youtube.com", "youtu.be"], tags: ["youtube", "video"] },
  { hosts: ["vimeo.com"], tags: ["vimeo", "video"] },
  { hosts: ["nicovideo.jp"], tags: ["niconico", "video"] },
  { hosts: ["qiita.com"], tags: ["qiita", "tech"] },
  { hosts: ["zenn.dev"], tags: ["zenn", "tech"] },
  { hosts: ["dev.to"], tags: ["dev.to", "tech"] },
  { hosts: ["note.com"], tags: ["note", "blog"] },
  { hosts: ["medium.com"], tags: ["medium", "blog"] },
  { hosts: ["hatenablog.com", "hatenablog.jp", "hateblo.jp"], tags: ["hatena", "blog"] },
  { hosts: ["b.hatena.ne.jp"], tags: ["hatena-bookmark"] },
  { hosts: ["x.com", "twitter.com"], tags: ["x", "sns"] },
  { hosts: ["threads.net", "threads.com"], tags: ["threads", "sns"] },
  { hosts: ["bsky.app"], tags: ["bluesky", "sns"] },
  { hosts: ["instagram.com"], tags: ["instagram", "sns"] },
  { hosts: ["facebook.com"], tags: ["facebook", "sns"] },
  { hosts: ["linkedin.com"], tags: ["linkedin", "sns"] },
  { hosts: ["reddit.com"], tags: ["reddit", "community"] },
  { hosts: ["news.ycombinator.com"], tags: ["hacker-news", "news"] },
  { hosts: ["stackoverflow.com", "stackexchange.com"], tags: ["stackoverflow", "q&a"] },
  { hosts: ["teratail.com"], tags: ["teratail", "q&a"] },
  { hosts: ["developer.mozilla.org"], tags: ["mdn", "docs", "web"] },
  { hosts: ["npmjs.com"], tags: ["npm", "javascript"] },
  { hosts: ["pypi.org"], tags: ["pypi", "python"] },
  { hosts: ["crates.io"], tags: ["crates", "rust"] },
  { hosts: ["pkg.go.dev"], tags: ["go", "docs"] },
  { hosts: ["react.dev"], tags: ["react", "docs"] },
  { hosts: ["developers.cloudflare.com"], tags: ["cloudflare", "docs"] },
  { hosts: ["aws.amazon.com"], tags: ["aws"] },
  { hosts: ["cloud.google.com"], tags: ["gcp"] },
  { hosts: ["learn.microsoft.com"], tags: ["microsoft", "docs"] },
  { hosts: ["amazon.co.jp", "amazon.com"], tags: ["amazon", "shopping"] },
  { hosts: ["rakuten.co.jp"], tags: ["rakuten", "shopping"] },
  { hosts: ["speakerdeck.com", "slideshare.net"], tags: ["slides"] },
  { hosts: ["docs.google.com"], tags: ["google-docs"] },
  { hosts: ["figma.com"], tags: ["figma", "design"] },
  { hosts: ["dribbble.com", "behance.net"], tags: ["design"] },
  { hosts: ["notion.so", "notion.site"], tags: ["notion"] },
  { hosts: ["arxiv.org"], tags: ["arxiv", "paper"] },
  { hosts: ["wikipedia.org"], tags: ["wikipedia"] },
  { hosts: ["huggingface.co"], tags: ["huggingface", "ai"] },
  { hosts: ["openai.com", "anthropic.com"], tags: ["ai"] },
  { hosts: ["spotify.com"], tags: ["spotify", "music"] },
  { hosts: ["connpass.com", "doorkeeper.jp"], tags: ["event"] },
  { hosts: ["maps.google.com", "maps.app.goo.gl"], tags: ["map"] },
  { hosts: ["cookpad.com", "kurashiru.com"], tags: ["recipe"] },
  { hosts: ["tabelog.com"], tags: ["tabelog", "gourmet"] },
];

/** Path/subdomain/extension based rules applied to any URL. */
const GENERIC_RULES: Array<{ test: (u: URL) => boolean; tags: string[] }> = [
  { test: (u) => /^docs?\./.test(u.hostname) || /\/docs?(\/|$)/.test(u.pathname), tags: ["docs"] },
  { test: (u) => /^blog\./.test(u.hostname) || /\/blog(\/|$)/.test(u.pathname), tags: ["blog"] },
  { test: (u) => /^news\./.test(u.hostname) || /\/news(\/|$)/.test(u.pathname), tags: ["news"] },
  { test: (u) => /\.pdf$/i.test(u.pathname), tags: ["pdf"] },
  { test: (u) => /\.(png|jpe?g|gif|webp|svg)$/i.test(u.pathname), tags: ["image"] },
  { test: (u) => /\.(mp4|mov|webm)$/i.test(u.pathname), tags: ["video"] },
  { test: (u) => /\/(api|reference)(\/|$)/.test(u.pathname), tags: ["reference"] },
  { test: (u) => /\/(tutorial|getting-started|guide)s?(\/|$)/i.test(u.pathname), tags: ["tutorial"] },
];

/** Second-level labels that are not meaningful site names (e.g. co.jp). */
const PUBLIC_SECOND_LEVEL = new Set(["co", "or", "ne", "ac", "go", "gr", "ed", "lg", "com", "net", "org", "gov", "edu"]);

function hostMatches(hostname: string, rule: string): boolean {
  return hostname === rule || hostname.endsWith(`.${rule}`);
}

/** "www.example.co.jp" -> "example" */
export function siteName(hostname: string): string | null {
  const labels = hostname.replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length < 2) return null;
  if (/^\d+$/.test(labels[labels.length - 1]!)) return null; // IPv4
  let i = labels.length - 2;
  if (i > 0 && labels[labels.length - 1]!.length === 2 && PUBLIC_SECOND_LEVEL.has(labels[i]!)) i--;
  return labels[i] ?? null;
}

export function inferTagsFromUrl(rawUrl: string): string[] {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return [];
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return [];
  const hostname = u.hostname.toLowerCase();
  const tags: string[] = [];

  const rule = DOMAIN_RULES.find((r) => r.hosts.some((h) => hostMatches(hostname, h)));
  if (rule) {
    tags.push(...rule.tags);
  } else {
    const site = siteName(hostname);
    if (site) tags.push(site);
  }
  for (const g of GENERIC_RULES) if (g.test(u)) tags.push(...g.tags);

  return [...new Set(tags)];
}
