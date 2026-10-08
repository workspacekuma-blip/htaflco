import { pool } from './db';

/** Base query for post lists. $1 = viewer id (or null) so each post can show the viewer's own vote. */
export const POST_SELECT = `
  SELECT p.id, p.body, p.media_url AS "mediaUrl", p.pillar, p.craft,
         p.created_at AS "createdAt", p.edited_at AS "editedAt",
         p.up, p.down, (p.up - p.down) AS score, p.comment_count AS "commentCount",
         pr.display_name AS author,
         (SELECT v.value FROM votes v WHERE v.post_id = p.id AND v.user_id = $1::uuid) AS "myVote",
         to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
    FROM posts p
    JOIN profiles pr ON pr.user_id = p.author_id`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify([at, id])).toString('base64url');
}

export function decodeCursor(raw: unknown): { at: string; id: string } | null {
  if (typeof raw !== 'string') return null;
  try {
    const [at, id] = JSON.parse(Buffer.from(raw, 'base64url').toString());
    if (typeof at === 'string' && typeof id === 'string' && !Number.isNaN(Date.parse(at)) && UUID.test(id)) {
      return { at, id };
    }
  } catch {
    /* fall through */
  }
  return null;
}

type Row = Record<string, unknown> & { id: string; cursorAt: string };
const strip = ({ cursorAt: _drop, ...rest }: Row) => rest;

/**
 * Newest-first, keyset-paginated list of published posts.
 * Keyset (not page numbers) keeps every page equally fast however many posts exist.
 * Each filter's `sql` uses `?` where its value goes.
 */
export async function feedPage(
  viewerId: string | null,
  filters: { sql: string; value: unknown }[],
  rawCursor: unknown,
  rawLimit: unknown,
) {
  const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 50);
  const params: unknown[] = [viewerId];
  const where = [`p.status = 'published'`];
  for (const f of filters) {
    params.push(f.value);
    where.push(f.sql.replace('?', `$${params.length}`));
  }
  const cur = decodeCursor(rawCursor);
  if (cur) {
    params.push(cur.at, cur.id);
    where.push(`(p.created_at, p.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }
  params.push(limit + 1);
  const { rows } = await pool.query<Row>(
    `${POST_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY p.created_at DESC, p.id DESC LIMIT $${params.length}`,
    params,
  );
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items: items.map(strip),
    nextCursor: rows.length > limit && last ? encodeCursor(last.cursorAt, last.id) : null,
  };
}

/** Load specific posts and return them in the order given (used by Featured and Rising). */
export async function hydrate(viewerId: string | null, ids: string[]) {
  if (ids.length === 0) return [];
  const { rows } = await pool.query<Row>(
    `${POST_SELECT} WHERE p.id = ANY($2::uuid[]) AND p.status = 'published'`,
    [viewerId, ids],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => (byId.has(id) ? [strip(byId.get(id)!)] : []));
}
