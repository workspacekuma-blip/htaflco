import { config } from '../config';
import { pool, tx } from '../db';
import { FeaturedCandidate, RisingCandidate, selectFeatured, selectRising } from './score';

/**
 * Every vote with a trust weight. A vote counts (1.0) only if the voter's email is verified,
 * their account is at least 24 hours old, they are not flagged (trust_level > 0), and they
 * are not the post's author. Otherwise it counts for nothing (0.0).
 */
const WEIGHTED_VOTES = `(
  SELECT v.post_id, v.value, v.created_at AS voted_at,
         CASE WHEN u.email_verified
               AND u.created_at <= now() - interval '24 hours'
               AND pr.trust_level > 0
               AND v.user_id <> p.author_id
              THEN 1.0 ELSE 0.0 END AS weight
    FROM votes v
    JOIN posts p     ON p.id = v.post_id
    JOIN users u     ON u.id = v.user_id
    JOIN profiles pr ON pr.user_id = v.user_id
)`;

/** Published, not flagged as sensitive, and with no open report against it. */
const ELIGIBLE_POST = `p.status = 'published' AND NOT p.sensitive
  AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.target_type = 'post' AND r.target_id = p.id AND r.status = 'open')`;

async function saveSnapshot(kind: string, ids: string[]) {
  await tx(async (c) => {
    // Serialize replacement of an existing snapshot, including recovery after downtime.
    await c.query('SELECT kind FROM ranking_snapshots WHERE kind=$1 FOR UPDATE', [kind]);
    if (kind === 'featured') {
      // Recover the last known completed week before replacing a pre-upgrade/stale snapshot.
      // Never invent winners for weeks when the worker recorded no ranking.
      await c.query(`INSERT INTO featured_archive(week_start,items)
        SELECT date_trunc('week',computed_at AT TIME ZONE 'UTC')::date, items
        FROM ranking_snapshots WHERE kind='featured'
          AND computed_at < (date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
        ON CONFLICT(week_start) DO NOTHING`);
      // Each run durably records this week's latest list. Completed weeks have different keys
      // and stay frozen, so missing Sunday does not lose the last recorded list.
      await c.query(`INSERT INTO featured_archive(week_start,items)
        VALUES(date_trunc('week',now() AT TIME ZONE 'UTC')::date,$1::jsonb)
        ON CONFLICT(week_start) DO UPDATE SET items=EXCLUDED.items`, [JSON.stringify(ids)]);
    }
    await c.query(
      `INSERT INTO ranking_snapshots (kind, computed_at, items) VALUES ($1, now(), $2::jsonb)
       ON CONFLICT (kind) DO UPDATE SET computed_at = now(), items = EXCLUDED.items`,
      [kind, JSON.stringify(ids)],
    );
  });
}

export async function computeFeatured(): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT p.id, p.author_id, p.craft, p.created_at,
            COALESCE(SUM(CASE WHEN w.value =  1 THEN w.weight ELSE 0 END), 0)::float8 AS up,
            COALESCE(SUM(CASE WHEN w.value = -1 THEN w.weight ELSE 0 END), 0)::float8 AS down,
            COUNT(*) FILTER (WHERE w.weight > 0) AS voters
       FROM posts p JOIN ${WEIGHTED_VOTES} w ON w.post_id = p.id
      WHERE ${ELIGIBLE_POST} AND p.created_at > now() - interval '7 days'
      GROUP BY p.id`,
  );
  const candidates: FeaturedCandidate[] = rows.map((r) => ({
    postId: r.id, authorId: r.author_id, craft: r.craft, createdAt: r.created_at.getTime(),
    up: r.up, down: r.down, voters: Number(r.voters),
  }));
  const ids = selectFeatured(candidates, { minVoters: config.featuredMinVoters });
  await saveSnapshot('featured', ids);
  return ids;
}

export async function computeRising(excludeIds: string[]): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT p.id, p.author_id, p.created_at,
            COALESCE(SUM(w.weight * w.value * EXP(-EXTRACT(EPOCH FROM (now() - w.voted_at)) / 21600.0)), 0)::float8 AS momentum,
            COUNT(*) FILTER (WHERE w.weight > 0 AND w.voted_at > now() - interval '6 hours') AS recent_voters,
            (SELECT COUNT(*) FROM posts q WHERE q.author_id = p.author_id AND q.status = 'published') < 3 AS newcomer
       FROM posts p JOIN ${WEIGHTED_VOTES} w ON w.post_id = p.id
      WHERE ${ELIGIBLE_POST} AND p.created_at > now() - interval '72 hours'
      GROUP BY p.id`,
  );
  const skip = new Set(excludeIds);
  const candidates: RisingCandidate[] = rows
    .filter((r) => !skip.has(r.id))
    .map((r) => ({
      postId: r.id, authorId: r.author_id, createdAt: r.created_at.getTime(),
      momentum: r.momentum, recentVoters: Number(r.recent_voters), newcomer: r.newcomer,
    }));
  const ids = selectRising(candidates, { minVoters: config.risingMinVoters });
  await saveSnapshot('rising', ids);
  return ids;
}

export async function runOnce(withFeatured: boolean) {
  let featured: string[];
  if (withFeatured) {
    featured = await computeFeatured();
  } else {
    const { rows } = await pool.query(`SELECT items FROM ranking_snapshots WHERE kind = 'featured'`);
    featured = rows[0]?.items ?? [];
  }
  await computeRising(featured);
}

// Single-instance loop: skip overlapping ticks and finish active work before shutdown.
export function startRankingLoop() {
  let tick = 0;
  let current: Promise<void> | undefined;
  const run = async () => {
    try {
      await runOnce(tick % 5 === 0);
    } catch (e) {
      console.error('Ranking run failed', e);
    }
    tick++;
  };
  const start = () => {
    if (current) return;
    current = run().finally(() => { current = undefined; });
  };
  start();
  const interval = setInterval(start, 60_000);
  return async () => { clearInterval(interval); await current; };
}

// Run separately locally, or share the free web instance through hosted.ts.
if (require.main === module) {
  const stop = startRankingLoop();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => { void stop().then(() => pool.end()); });
  }
}
