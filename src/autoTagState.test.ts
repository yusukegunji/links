import { describe, expect, it } from "vitest";
import { mergeAutoTags } from "./autoTagState";

const S = (...xs: string[]) => new Set(xs);

describe("mergeAutoTags", () => {
  it("adds inferred tags after manual ones", () => {
    expect(mergeAutoTags(["mine"], S(), ["github", "code"], S())).toEqual({
      tags: ["mine", "github", "code"],
      auto: S("github", "code"),
    });
  });
  it("replaces stale auto tags when the url changes", () => {
    expect(mergeAutoTags(["mine", "github", "code"], S("github", "code"), ["youtube", "video"], S())).toEqual({
      tags: ["mine", "youtube", "video"],
      auto: S("youtube", "video"),
    });
  });
  it("keeps a tag the user typed even if it is also inferred", () => {
    const r = mergeAutoTags(["code"], S(), ["github", "code"], S());
    expect(r.tags).toEqual(["code", "github"]);
    expect(r.auto).toEqual(S("github"));
  });
  it("respects dismissed tags", () => {
    expect(mergeAutoTags([], S(), ["github", "code"], S("code")).tags).toEqual(["github"]);
  });
  it("clears auto tags when the url becomes invalid", () => {
    expect(mergeAutoTags(["mine", "github"], S("github"), [], S())).toEqual({ tags: ["mine"], auto: S() });
  });
});
