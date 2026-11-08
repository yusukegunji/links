import { Hono } from "hono";
import { requireToken } from "./auth";
import { ConflictError, createLink, deleteLink, getLink, listLinks, listTags, updateLink } from "./repository";
import { parseLinkInput, parseLinkPatch, ValidationError } from "./validation";
import { MAX_TAGS, normalizeTags } from "../shared/tags";

export const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

app.use("/*", async (c, next) => {
  if (c.req.path === "/api/health") return next();
  return requireToken(c, next);
});

app.onError((err, c) => {
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
  if (err instanceof ConflictError) return c.json({ error: err.message }, 409);
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("invalid id");
  return id;
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError("invalid JSON");
  }
}

app.get("/auth/check", (c) => c.json({ ok: true }));

app.get("/links", async (c) => {
  const rawTags = (c.req.query("tags") ?? "").split(",").filter((t) => t.trim());
  if (rawTags.length > MAX_TAGS) throw new ValidationError(`too many tags (max ${MAX_TAGS})`);
  const tags = normalizeTags(rawTags);
  const links = await listLinks(c.env.DB, { tags, q: c.req.query("q") });
  return c.json({ links });
});

app.get("/links/:id", async (c) => {
  const link = await getLink(c.env.DB, parseId(c.req.param("id")));
  return link ? c.json({ link }) : c.json({ error: "not found" }, 404);
});

app.post("/links", async (c) => {
  const input = parseLinkInput(await readJson(c.req.raw));
  const link = await createLink(c.env.DB, input);
  return c.json({ link }, 201);
});

app.patch("/links/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const link = await updateLink(c.env.DB, id, parseLinkPatch(await readJson(c.req.raw)));
  return link ? c.json({ link }) : c.json({ error: "not found" }, 404);
});

app.delete("/links/:id", async (c) => {
  const ok = await deleteLink(c.env.DB, parseId(c.req.param("id")));
  return ok ? c.body(null, 204) : c.json({ error: "not found" }, 404);
});

app.get("/tags", async (c) => c.json({ tags: await listTags(c.env.DB) }));
