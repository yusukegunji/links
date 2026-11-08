import { describe, expect, it } from "vitest";
import { inferTagsFromUrl, siteName } from "./autoTags";

describe("inferTagsFromUrl", () => {
  it.each([
    ["https://github.com/honojs/hono", ["github", "code"]],
    ["https://gist.github.com/foo/123", ["github", "code"]],
    ["https://www.youtube.com/watch?v=abc", ["youtube", "video"]],
    ["https://youtu.be/abc", ["youtube", "video"]],
    ["https://zenn.dev/foo/articles/bar", ["zenn", "tech"]],
    ["https://qiita.com/foo/items/1", ["qiita", "tech"]],
    ["https://x.com/someone/status/1", ["x", "sns"]],
    ["https://developer.mozilla.org/ja/docs/Web/API", ["mdn", "docs", "web"]],
    ["https://aws.amazon.com/jp/", ["aws"]],
    ["https://www.amazon.co.jp/dp/123", ["amazon", "shopping"]],
  ])("%s", (url, expected) => {
    expect(inferTagsFromUrl(url)).toEqual(expected);
  });

  it("falls back to the site name for unknown domains", () => {
    expect(inferTagsFromUrl("https://www.example.co.jp/")).toEqual(["example"]);
    expect(inferTagsFromUrl("https://foo.example.com/")).toEqual(["example"]);
  });

  it("applies generic path/subdomain rules", () => {
    expect(inferTagsFromUrl("https://docs.example.com/intro")).toEqual(["example", "docs"]);
    expect(inferTagsFromUrl("https://example.com/blog/post")).toEqual(["example", "blog"]);
    expect(inferTagsFromUrl("https://example.com/paper.PDF")).toEqual(["example", "pdf"]);
    expect(inferTagsFromUrl("https://example.com/getting-started")).toEqual(["example", "tutorial"]);
  });

  it("returns nothing for invalid or non-http urls", () => {
    expect(inferTagsFromUrl("")).toEqual([]);
    expect(inferTagsFromUrl("not a url")).toEqual([]);
    expect(inferTagsFromUrl("ftp://example.com/")).toEqual([]);
  });
});

describe("siteName", () => {
  it("handles edge cases", () => {
    expect(siteName("localhost")).toBeNull();
    expect(siteName("192.168.0.1")).toBeNull();
    expect(siteName("example.com")).toBe("example");
  });
});
