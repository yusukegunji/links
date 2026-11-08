import { describe, expect, it } from "vitest";
import { MAX_TAGS, normalizeTag, normalizeTags } from "./tags";

describe("normalizeTag", () => {
  it("trims, strips #, lowercases and hyphenates spaces", () => {
    expect(normalizeTag("  #Machine Learning ")).toBe("machine-learning");
    expect(normalizeTag("日本語")).toBe("日本語");
    expect(normalizeTag("   ")).toBe("");
  });
});

describe("normalizeTags", () => {
  it("dedupes and caps", () => {
    expect(normalizeTags(["A", "a", "#a", "b"])).toEqual(["a", "b"]);
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS);
  });
});
