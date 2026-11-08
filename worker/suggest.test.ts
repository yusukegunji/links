import { describe, expect, it, vi } from "vitest";
import { decodeEntities, extractTitle, fetchTitle, isFetchableHost, suggest } from "./suggest";

function htmlResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, ...init });
}

describe("extractTitle", () => {
  it("prefers og:title in either attribute order", () => {
    expect(extractTitle('<meta property="og:title" content="OG"><title>T</title>')).toBe("OG");
    expect(extractTitle('<meta content="OG2" property="og:title"><title>T</title>')).toBe("OG2");
  });
  it("falls back to <title> and normalizes whitespace/entities", () => {
    expect(extractTitle("<title>\n  A &amp; B &#x1F600; &#12354;\n</title>")).toBe("A & B 😀 あ");
    expect(extractTitle("<p>no title</p>")).toBe("");
  });
});

describe("decodeEntities", () => {
  it("leaves unknown entities and invalid code points", () => {
    expect(decodeEntities("&foo; &#0; &#x110000;")).toBe("&foo; &#0; &#x110000;");
  });
});

describe("isFetchableHost", () => {
  it.each([
    ["example.com", true],
    ["localhost", false],
    ["foo.localhost", false],
    ["127.0.0.1", false],
    ["[::1]", false],
    ["printer.local", false],
    ["intranet", false],
  ])("%s -> %s", (h, ok) => expect(isFetchableHost(h)).toBe(ok));
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
    const big = "<title>Big</title>" + "x".repeat(1024 * 1024);
    const f = vi.fn(async () => htmlResponse(big));
    expect(await fetchTitle("https://example.com/", f as unknown as typeof fetch)).toBe("Big");
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
