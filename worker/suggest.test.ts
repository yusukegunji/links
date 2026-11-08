import { describe, expect, it, vi } from "vitest";
import { decodeEntities, detectCharset, extractTitle, fetchTitle, isFetchableUrl, parseAttributes, suggest } from "./suggest";

function htmlResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, ...init });
}

describe("extractTitle", () => {
  it("prefers og:title in either attribute order", () => {
    expect(extractTitle('<meta property="og:title" content="OG"><title>T</title>')).toBe("OG");
    expect(extractTitle('<meta content="OG2" property="og:title"><title>T</title>')).toBe("OG2");
    expect(extractTitle(`<meta property="og:title" content="Don't stop">`)).toBe("Don't stop");
    expect(extractTitle("<titlefoo>x</titlefoo><title>Real</title>")).toBe("Real");
    expect(extractTitle('<meta property="og:title" content=""><title>Fallback</title>')).toBe("Fallback");
  });
  it("falls back to <title> and normalizes whitespace/entities", () => {
    expect(extractTitle("<title>\n  A &amp; B &#x1F600; &#12354;\n</title>")).toBe("A & B 😀 あ");
    expect(extractTitle("<p>no title</p>")).toBe("");
  });
});

describe("decodeEntities", () => {
  it("leaves unknown entities and invalid code points", () => {
    expect(decodeEntities("&foo; &#0; &#x110000; &#xD800;")).toBe("&foo; &#0; &#x110000; &#xD800;");
    expect(decodeEntities("a&hellip;")).toBe("a…");
  });
});

describe("isFetchableUrl", () => {
  it.each([
    ["https://example.com/", true],
    ["https://example.com:443/", true],
    ["http://localhost/", false],
    ["http://localhost./", false],
    ["http://x.local./", false],
    ["http://foo.localhost/", false],
    ["http://127.0.0.1/", false],
    ["http://2130706433/", false],
    ["http://[::1]/", false],
    ["http://intranet/", false],
    ["https://example.com:8080/", false],
  ])("%s -> %s", (u, ok) => expect(isFetchableUrl(new URL(u))).toBe(ok));
});

describe("parseAttributes", () => {
  it("handles mixed quotes and unquoted values", () => {
    expect(parseAttributes(`<meta property="og:title" content="Don't stop" data-x=1 hidden>`)).toEqual({
      property: "og:title",
      content: "Don't stop",
      "data-x": "1",
      hidden: "",
    });
  });
});

describe("pathological input", () => {
  it("stays linear on unterminated tags", () => {
    const evil = "<meta ".repeat(40000) + "<title>".repeat(40000);
    const start = performance.now();
    expect(extractTitle(evil)).toBe("");
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("detectCharset", () => {
  it("uses header, then meta, then utf-8", () => {
    const meta = new TextEncoder().encode('<meta charset="Shift_JIS">');
    expect(detectCharset("text/html; charset=EUC-JP", meta)).toBe("euc-jp");
    expect(detectCharset("text/html", meta)).toBe("shift_jis");
    expect(detectCharset("text/html", new Uint8Array())).toBe("utf-8");
    expect(detectCharset("text/html; charset=bogus", new Uint8Array())).toBe("utf-8");
  });
});

describe("fetchTitle", () => {
  it("fetches and extracts the title", async () => {
    const f = vi.fn(async () => htmlResponse("<title>Hello</title>"));
    expect(await fetchTitle("https://example.com/", f as unknown as typeof fetch)).toBe("Hello");
  });
  it("returns empty for non-html, errors, and blocked hosts", async () => {
    const json = vi.fn(async () => new Response("{}", { headers: { "Content-Type": "application/json" } }));
    expect(await fetchTitle("https://example.com/", json as unknown as typeof fetch)).toBe("");
    const notFound = vi.fn(async () => htmlResponse("<title>x</title>", { status: 404 }));
    expect(await fetchTitle("https://example.com/", notFound as unknown as typeof fetch)).toBe("");
    const boom = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await fetchTitle("https://example.com/", boom as unknown as typeof fetch)).toBe("");
    const never = vi.fn();
    expect(await fetchTitle("http://127.0.0.1/", never as unknown as typeof fetch)).toBe("");
    expect(never).not.toHaveBeenCalled();
  });
  it("only reads up to the size limit", async () => {
    const big = "x".repeat(300 * 1024) + "<title>TooFar</title>";
    const f = vi.fn(async () => htmlResponse(big));
    expect(await fetchTitle("https://example.com/", f as unknown as typeof fetch)).toBe("");
  });
  it("decodes Shift_JIS pages", async () => {
    // "テスト" in Shift_JIS
    const bytes = new Uint8Array([0x3c,0x74,0x69,0x74,0x6c,0x65,0x3e,0x83,0x65,0x83,0x58,0x83,0x67,0x3c,0x2f,0x74,0x69,0x74,0x6c,0x65,0x3e]);
    const f = vi.fn(async () => new Response(bytes, { headers: { "Content-Type": "text/html; charset=Shift_JIS" } }));
    expect(await fetchTitle("https://example.jp/", f as unknown as typeof fetch)).toBe("テスト");
  });
  it("follows redirects but re-validates each hop", async () => {
    const f = vi.fn(async (url: string) =>
      url === "https://a.example/"
        ? new Response(null, { status: 302, headers: { Location: "/next" } })
        : url === "https://a.example/next"
          ? new Response(null, { status: 301, headers: { Location: "http://localhost/" } })
          : htmlResponse("<title>internal</title>"),
    );
    expect(await fetchTitle("https://a.example/", f as unknown as typeof fetch)).toBe("");
    expect(f).toHaveBeenCalledTimes(2);

    const ok = vi.fn(async (url: string) =>
      url === "https://a.example/" ? new Response(null, { status: 302, headers: { Location: "https://b.example/" } }) : htmlResponse("<title>B</title>"),
    );
    expect(await fetchTitle("https://a.example/", ok as unknown as typeof fetch)).toBe("B");
  });
  it("gives up after too many redirects", async () => {
    const loop = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "https://a.example/" } }));
    expect(await fetchTitle("https://a.example/", loop as unknown as typeof fetch)).toBe("");
    expect(loop).toHaveBeenCalledTimes(4);
  });
});

describe("suggest", () => {
  it("returns title and url-derived tags", async () => {
    const f = vi.fn(async () => htmlResponse("<title>hono</title>"));
    expect(await suggest("https://github.com/honojs/hono", f as unknown as typeof fetch)).toEqual({
      title: "hono",
      tags: ["github", "code"],
    });
  });
});
