import { Router } from 'express';
import { z } from 'zod';
import { Authed, perUser, requireRole } from '../auth';
import { pool } from '../db';
import { ah, HttpError } from '../http';

export const promptsRouter = Router();
const projection = 'id, week_start::text AS "weekStart", title, body';

promptsRouter.get('/prompts/current', ah(async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${projection} FROM weekly_prompts WHERE week_start=date_trunc('week',now() AT TIME ZONE 'UTC')::date`);
  res.set('Cache-Control', 'no-store').json({ prompt: rows[0] ?? null });
}));

promptsRouter.get('/admin/prompts', requireRole('moderator', 'admin'), ah(async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${projection} FROM weekly_prompts ORDER BY week_start DESC LIMIT 50`);
  res.json({ items: rows });
}));

promptsRouter.post('/admin/prompts', requireRole('moderator', 'admin'), perUser(30, 3600_000), ah(async (req, res) => {
  const b = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), title: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(500) }).parse(req.body);
  const d = new Date(b.weekStart + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== b.weekStart || d.getUTCDay() !== 1) throw new HttpError(400, 'Choose a Monday for the start of the week (UTC).');
  const current = (await pool.query("SELECT date_trunc('week',now() AT TIME ZONE 'UTC')::date::text AS week")).rows[0].week;
  if (b.weekStart < current) throw new HttpError(400, 'Completed weeks cannot be changed. Choose this week or a future Monday.');
  const { rows } = await pool.query(`INSERT INTO weekly_prompts(week_start,title,body,scheduled_by) VALUES($1,$2,$3,$4)
    ON CONFLICT(week_start) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body,scheduled_by=EXCLUDED.scheduled_by,updated_at=now() RETURNING id`, [b.weekStart, b.title, b.body, (req as Authed).user!.id]);
  res.status(201).json({ id: rows[0].id });
}));
