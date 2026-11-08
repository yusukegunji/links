import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Link, TagCount } from "../shared/types";
import { setupTestEnv } from "./test-utils";

let t: Awaited<ReturnType<typeof setupTestEnv>>;

beforeAll(async () => {
  t = await setupTestEnv();
});
afterAll(async () => {
  await t.dispose();
});
beforeEach(async () => {
  await t.reset();
});

async function create(json: unknown) {
  const res = await t.request("/api/links", { method: "POST", json });
  return { res, body: (await res.json()) as { link: Link; error?: string } };
}

async function list(qs = "") {
  const res = await t.request(`/api/links${qs}`);
  return ((await res.json()) as { links: Link[] }).links;
}

describe("auth", () => {
  it("health is public", async () => {
    const res = await t.request("/api/health", {}, null);
    expect(res.status).toBe(200);
  });

  it("rejects missing or wrong token", async () => {
    expect((await t.request("/api/links", {}, null)).status).toBe(401);
    expect((await t.request("/api/links", {}, "wrong")).status).toBe(401);
    expect((await t.request("/api/auth/check")).status).toBe(200);
  });
});

describe("POST /api/links", () => {
  it("creates a link with normalized tags", async () => {
    const { res, body } = await create({
      url: "https://example.com/a",
      title: " Example ",
      tags: ["#React", "react", " TypeScript ", ""],
    });
    expect(res.status).toBe(201);
    expect(body.link).toMatchObject({
      url: "https://example.com/a",
      title: "Example",
      note: "",
      tags: ["react", "typescript"],
    });
  });

  it("rejects invalid urls", async () => {
    expect((await create({ url: "javascript:alert(1)" })).res.status).toBe(400);
    expect((await create({ url: "not a url" })).res.status).toBe(400);
    expect((await create({})).res.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const res = await t.request("/api/links", {
      method: "POST",
      body: "{",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate urls", async () => {
    await create({ url: "https://example.com/dup" });
    expect((await create({ url: "https://example.com/dup" })).res.status).toBe(409);
  });
});

describe("GET /api/links", () => {
  beforeEach(async () => {
    await create({ url: "https://react.dev/", title: "React docs", tags: ["react", "docs"] });
    await create({ url: "https://github.com/honojs/hono", title: "Hono", tags: ["github", "typescript"] });
    await create({ url: "https://zenn.dev/x", title: "記事", note: "Reactのフック解説", tags: ["zenn", "react"] });
  });

  it("returns newest first", async () => {
    const links = await list();
    expect(links.map((l) => l.title)).toEqual(["記事", "Hono", "React docs"]);
  });

  it("filters by tags with AND semantics", async () => {
    expect((await list("?tags=react")).length).toBe(2);
    expect((await list("?tags=react,docs")).map((l) => l.title)).toEqual(["React docs"]);
    expect((await list("?tags=nope")).length).toBe(0);
  });

  it("searches url, title, note and tags", async () => {
    expect((await list("?q=hono")).map((l) => l.title)).toEqual(["Hono"]);
    expect((await list("?q=" + encodeURIComponent("フック"))).map((l) => l.title)).toEqual(["記事"]);
    expect((await list("?q=typescript")).map((l) => l.title)).toEqual(["Hono"]);
    expect((await list("?q=" + encodeURIComponent("react docs"))).map((l) => l.title)).toEqual(["React docs"]);
  });

  it("treats LIKE wildcards literally", async () => {
    expect((await list("?q=%25")).length).toBe(0);
    expect((await list("?q=_")).length).toBe(0);
  });

  it("combines tag filter and search", async () => {
    expect((await list("?tags=react&q=zenn")).map((l) => l.title)).toEqual(["記事"]);
  });
});

describe("PATCH / DELETE /api/links/:id", () => {
  it("updates fields and replaces tags, pruning orphan tags", async () => {
    const { body } = await create({ url: "https://a.example/", tags: ["old", "keep"] });
    const res = await t.request(`/api/links/${body.link.id}`, {
      method: "PATCH",
      json: { title: "New", tags: ["keep", "new"] },
    });
    expect(res.status).toBe(200);
    const { link } = (await res.json()) as { link: Link };
    expect(link).toMatchObject({ title: "New", tags: ["keep", "new"], url: "https://a.example/" });

    const tags = ((await (await t.request("/api/tags")).json()) as { tags: TagCount[] }).tags;
    expect(tags.map((x) => x.name).sort()).toEqual(["keep", "new"]);
  });

  it("returns 404 for unknown ids and 400 for bad ids", async () => {
    expect((await t.request("/api/links/999", { method: "PATCH", json: {} })).status).toBe(404);
    expect((await t.request("/api/links/abc")).status).toBe(400);
    expect((await t.request("/api/links/999", { method: "DELETE" })).status).toBe(404);
  });

  it("deletes a link and its orphan tags", async () => {
    const { body } = await create({ url: "https://b.example/", tags: ["solo"] });
    expect((await t.request(`/api/links/${body.link.id}`, { method: "DELETE" })).status).toBe(204);
    expect(await list()).toEqual([]);
    const tags = ((await (await t.request("/api/tags")).json()) as { tags: TagCount[] }).tags;
    expect(tags).toEqual([]);
  });
});

describe("GET /api/tags", () => {
  it("returns tag counts ordered by count", async () => {
    await create({ url: "https://1.example/", tags: ["a", "b"] });
    await create({ url: "https://2.example/", tags: ["a"] });
    const tags = ((await (await t.request("/api/tags")).json()) as { tags: TagCount[] }).tags;
    expect(tags).toEqual([
      { name: "a", count: 2 },
      { name: "b", count: 1 },
    ]);
  });
});

describe("review follow-ups", () => {
  it("PATCH to a duplicate url returns 409 and rolls back", async () => {
    await create({ url: "https://one.example/", tags: ["x"] });
    const { body } = await create({ url: "https://two.example/", title: "Two", tags: ["y"] });
    const res = await t.request(`/api/links/${body.link.id}`, {
      method: "PATCH",
      json: { url: "https://one.example/", title: "Changed", tags: ["z"] },
    });
    expect(res.status).toBe(409);
    const after = (await (await t.request(`/api/links/${body.link.id}`)).json()) as { link: Link };
    expect(after.link).toMatchObject({ url: "https://two.example/", title: "Two", tags: ["y"] });
  });

  it("PATCH can change url and clear all tags while keeping shared tags", async () => {
    await create({ url: "https://keep.example/", tags: ["shared"] });
    const { body } = await create({ url: "https://old.example/", tags: ["shared", "only"] });
    const res = await t.request(`/api/links/${body.link.id}`, {
      method: "PATCH",
      json: { url: "https://new.example/", tags: [] },
    });
    const { link } = (await res.json()) as { link: Link };
    expect(link).toMatchObject({ url: "https://new.example/", tags: [] });
    const tags = ((await (await t.request("/api/tags")).json()) as { tags: TagCount[] }).tags;
    expect(tags).toEqual([{ name: "shared", count: 1 }]);
  });

  it("combines multiple tags and multiple terms", async () => {
    await create({ url: "https://a.example/", title: "alpha beta", tags: ["t1", "t2"] });
    await create({ url: "https://b.example/", title: "alpha", tags: ["t1", "t2"] });
    await create({ url: "https://c.example/", title: "alpha beta", tags: ["t1"] });
    expect((await list("?tags=t1,t2&q=alpha%20beta")).map((l) => l.url)).toEqual(["https://a.example/"]);
  });

  it("escapes backslashes in search", async () => {
    await create({ url: "https://a.example/", title: "plain" });
    expect((await list("?q=%5C")).length).toBe(0);
  });

  it("rejects more than 20 tag filters", async () => {
    const qs = Array.from({ length: 21 }, (_, i) => `t${i}`).join(",");
    expect((await t.request(`/api/links?tags=${qs}`)).status).toBe(400);
  });

  it("commas in tags are converted so they remain filterable", async () => {
    const { body } = await create({ url: "https://comma.example/", tags: ["a,b"] });
    expect(body.link.tags).toEqual(["a-b"]);
    expect((await list("?tags=a-b")).length).toBe(1);
  });

  it("rejects urls with credentials", async () => {
    expect((await create({ url: "https://u:p@example.com/" })).res.status).toBe(400);
  });

  it("auth edge cases", async () => {
    expect((await t.request("/api/links", { headers: { Authorization: "test-token" } }, null)).status).toBe(401);
    expect((await t.request("/api/links", { headers: { Authorization: "bearer test-token" } }, null)).status).toBe(200);
    expect((await t.request("/api/unknown", {}, null)).status).toBe(401);
    const { app } = await import("./app");
    const res = await app.request("/api/links", { headers: { Authorization: "Bearer x" } }, { ...t.env, APP_TOKEN: "" });
    expect(res.status).toBe(500);
  });
});
