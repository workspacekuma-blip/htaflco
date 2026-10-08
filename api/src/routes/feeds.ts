import { Request, Router } from 'express';
import { z } from 'zod';
import { Authed } from '../auth';
import { pool } from '../db';
import { ah } from '../http';
import { feedPage, hydrate } from '../queries';
import { CRAFTS } from './auth';
import { PILLARS } from './posts';

export const feedsRouter = Router();
const viewer = (req: Request) => (req as Authed).user?.id ?? null;

// Latest: newest first.
feedsRouter.get('/latest', ah(async (req, res) => {
  res.json(await feedPage(viewer(req), [], req.query.cursor, req.query.limit));
}));

// Browse: filter by kind (pillar), craft, or challenge.
feedsRouter.get('/browse', ah(async (req, res) => {
  const q = z.object({
    pillar: z.enum(PILLARS).optional(),
    craft: z.enum(CRAFTS).optional(),
    challenge: z.string().uuid().optional(),
  }).parse(req.query);
  const filters: { sql: string; value: unknown }[] = [];
  if (q.pillar) filters.push({ sql: 'p.pillar = ?::pillar', value: q.pillar });
  if (q.craft) filters.push({ sql: 'p.craft = ?', value: q.craft });
  if (q.challenge) filters.push({ sql: 'p.challenge_id = ?::uuid', value: q.challenge });
  res.json(await feedPage(viewer(req), filters, req.query.cursor, req.query.limit));
}));

// Featured and Rising are precomputed by the ranking worker. This only reads the saved list.
const snapshotFeed = (kind: 'featured' | 'rising') =>
  ah(async (req, res) => {
    const { rows } = await pool.query('SELECT items, computed_at FROM ranking_snapshots WHERE kind = $1', [kind]);
    const ids: string[] = rows[0]?.items ?? [];
    res.json({ items: await hydrate(viewer(req), ids), computedAt: rows[0]?.computed_at ?? null });
  });

feedsRouter.get('/featured', snapshotFeed('featured'));
feedsRouter.get('/rising', snapshotFeed('rising'));
