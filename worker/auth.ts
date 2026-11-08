import type { MiddlewareHandler } from "hono";

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Constant-time comparison via fixed-length SHA-256 digests. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i]! ^ db[i]!;
  return diff === 0;
}

/** Requires `Authorization: Bearer <APP_TOKEN>`. Fails closed when APP_TOKEN is not configured. */
export const requireToken: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const expected = c.env.APP_TOKEN;
  if (!expected) {
    console.error("APP_TOKEN is not configured");
    return c.json({ error: "internal error" }, 500);
  }
  const header = c.req.header("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !(await safeEqual(match[1]!, expected))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};
