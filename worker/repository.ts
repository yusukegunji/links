import type { Link, LinkInput, TagCount } from "../shared/types";

interface LinkRow {
  id: number;
  url: string;
  title: string;
  note: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export class ConflictError extends Error {}

const SELECT_LINK = `
  SELECT l.id, l.url, l.title, l.note, l.created_at, l.updated_at,
    (SELECT json_group_array(t.name) FROM (
       SELECT t.name FROM link_tags lt JOIN tags t ON t.id = lt.tag_id
       WHERE lt.link_id = l.id ORDER BY t.name
     ) t) AS tags
  FROM links l`;

function toLink(row: LinkRow): Link {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    note: row.note,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed: links\.url/.test(e.message);
}

function tagStatements(db: D1Database, linkIdSql: string, linkIdArg: string | number, tags: string[]) {
  return tags.flatMap((name) => [
    db.prepare("INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING").bind(name),
    db
      .prepare(
        `INSERT OR IGNORE INTO link_tags (link_id, tag_id)
         SELECT (${linkIdSql}), id FROM tags
         WHERE name = ? AND EXISTS (SELECT 1 FROM links WHERE id = (${linkIdSql}))`,
      )
      .bind(linkIdArg, name, linkIdArg),
  ]);
}

function pruneOrphanTags(db: D1Database) {
  return db.prepare("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM link_tags)");
}

export interface ListQuery {
  tags?: string[];
  q?: string;
  limit?: number;
}

export async function listLinks(db: D1Database, query: ListQuery = {}): Promise<Link[]> {
  const where: string[] = [];
  const args: unknown[] = [];

  for (const tag of query.tags ?? []) {
    where.push(
      `EXISTS (SELECT 1 FROM link_tags lt JOIN tags t ON t.id = lt.tag_id
               WHERE lt.link_id = l.id AND t.name = ?)`,
    );
    args.push(tag);
  }

  const terms = (query.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 10);
  for (const term of terms) {
    const like = `%${escapeLike(term)}%`;
    where.push(
      `(l.url LIKE ?1 ESCAPE '\\' OR l.title LIKE ?1 ESCAPE '\\' OR l.note LIKE ?1 ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM link_tags lt JOIN tags t ON t.id = lt.tag_id
                   WHERE lt.link_id = l.id AND t.name LIKE ?1 ESCAPE '\\'))`.replaceAll(
        "?1",
        `?${args.length + 1}`,
      ),
    );
    args.push(like);
  }

  const limit = Math.min(Math.max(query.limit ?? 500, 1), 1000);
  const sql = `${SELECT_LINK} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY l.created_at DESC, l.id DESC LIMIT ${limit}`;
  const { results } = await db.prepare(sql).bind(...args).all<LinkRow>();
  return results.map(toLink);
}

export async function getLink(db: D1Database, id: number): Promise<Link | null> {
  const row = await db.prepare(`${SELECT_LINK} WHERE l.id = ?`).bind(id).first<LinkRow>();
  return row ? toLink(row) : null;
}

export async function createLink(db: D1Database, input: Required<LinkInput>): Promise<Link> {
  try {
    await db.batch([
      db.prepare("INSERT INTO links (url, title, note) VALUES (?, ?, ?)").bind(input.url, input.title, input.note),
      ...tagStatements(db, "SELECT id FROM links WHERE url = ?", input.url, input.tags),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("url already exists");
    throw e;
  }
  const row = await db.prepare(`${SELECT_LINK} WHERE l.url = ?`).bind(input.url).first<LinkRow>();
  return toLink(row!);
}

export async function updateLink(db: D1Database, id: number, patch: Partial<LinkInput>): Promise<Link | null> {
  const existing = await getLink(db, id);
  if (!existing) return null;

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE links SET url = ?, title = ?, note = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      )
      .bind(patch.url ?? existing.url, patch.title ?? existing.title, patch.note ?? existing.note, id),
  ];
  if (patch.tags) {
    stmts.push(db.prepare("DELETE FROM link_tags WHERE link_id = ?").bind(id));
    stmts.push(...tagStatements(db, "?", id, patch.tags));
    stmts.push(pruneOrphanTags(db));
  }
  let results: D1Result[];
  try {
    results = await db.batch(stmts);
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("url already exists");
    throw e;
  }
  if ((results[0]?.meta.changes ?? 0) === 0) return null; // deleted concurrently
  return getLink(db, id);
}

export async function deleteLink(db: D1Database, id: number): Promise<boolean> {
  const results = await db.batch([
    db.prepare("DELETE FROM link_tags WHERE link_id = ?").bind(id),
    db.prepare("DELETE FROM links WHERE id = ?").bind(id),
    pruneOrphanTags(db),
  ]);
  return (results[1]?.meta.changes ?? 0) > 0;
}

export async function listTags(db: D1Database): Promise<TagCount[]> {
  const { results } = await db
    .prepare(
      `SELECT t.name AS name, COUNT(lt.link_id) AS count
       FROM tags t JOIN link_tags lt ON lt.tag_id = t.id
       GROUP BY t.id ORDER BY count DESC, t.name ASC`,
    )
    .all<TagCount>();
  return results;
}
