import { normalizeTags } from "../shared/tags";
import type { LinkInput } from "../shared/types";

export const MAX_URL_LENGTH = 2048;
export const MAX_TITLE_LENGTH = 300;
export const MAX_NOTE_LENGTH = 2000;

export class ValidationError extends Error {}

export function parseHttpUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError("url is required");
  const raw = value.trim();
  if (raw.length > MAX_URL_LENGTH) throw new ValidationError("url is too long");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ValidationError("url is invalid");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ValidationError("url must be http(s)");
  return u.toString();
}

function optString(value: unknown, name: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ValidationError(`${name} must be a string`);
  const v = value.trim();
  if (v.length > max) throw new ValidationError(`${name} is too long`);
  return v;
}

function optTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((t) => typeof t === "string")) {
    throw new ValidationError("tags must be an array of strings");
  }
  return normalizeTags(value);
}

export function parseLinkInput(body: unknown): Required<LinkInput> {
  if (typeof body !== "object" || body === null) throw new ValidationError("invalid body");
  const b = body as Record<string, unknown>;
  return {
    url: parseHttpUrl(b.url),
    title: optString(b.title, "title", MAX_TITLE_LENGTH) ?? "",
    note: optString(b.note, "note", MAX_NOTE_LENGTH) ?? "",
    tags: optTags(b.tags) ?? [],
  };
}

export function parseLinkPatch(body: unknown): Partial<LinkInput> {
  if (typeof body !== "object" || body === null) throw new ValidationError("invalid body");
  const b = body as Record<string, unknown>;
  return {
    url: b.url === undefined ? undefined : parseHttpUrl(b.url),
    title: optString(b.title, "title", MAX_TITLE_LENGTH),
    note: optString(b.note, "note", MAX_NOTE_LENGTH),
    tags: optTags(b.tags),
  };
}
