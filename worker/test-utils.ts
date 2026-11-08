import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { app } from "./app";

export const TOKEN = "test-token";

export async function setupTestEnv() {
  const proxy = await getPlatformProxy<Env>({ persist: false });
  const sql = readFileSync(join(import.meta.dirname, "../migrations/0001_init.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await proxy.env.DB.prepare(stmt).run();
  }
  const env: Env = { ...proxy.env, APP_TOKEN: TOKEN };

  async function request(path: string, init: RequestInit & { json?: unknown } = {}, token: string | null = TOKEN) {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let body = init.body;
    if (init.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.json);
    }
    return app.request(path, { ...init, headers, body }, env);
  }

  async function reset() {
    await proxy.env.DB.batch([
      proxy.env.DB.prepare("DELETE FROM link_tags"),
      proxy.env.DB.prepare("DELETE FROM tags"),
      proxy.env.DB.prepare("DELETE FROM links"),
    ]);
  }

  return { env, request, reset, dispose: () => proxy.dispose() };
}
