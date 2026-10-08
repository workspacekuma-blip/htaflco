import { Router } from 'express';
import { z } from 'zod';
import { perUser, requireAuth, requireRole } from '../auth';
import { pool, tx } from '../db';
import { POST_SELECT } from '../queries';
import { Authed } from '../auth';
import { ah, HttpError } from '../http';

export const reportsRouter = Router();

// Any signed-in member can report a post, comment or profile.
reportsRouter.post('/reports', requireAuth, perUser(20, 3600_000), ah(async (req, res) => {
  const b = z.object({
    targetType: z.enum(['post', 'comment', 'profile']),
    targetId: z.string().uuid(),
    reason: z.string().trim().min(3).max(300),
  }).parse(req.body);
  await pool.query(
    'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES ($1, $2, $3, $4)',
    [(req as unknown as { user: { id: string } }).user.id, b.targetType, b.targetId, b.reason],
  );
  res.status(201).json({ ok: true });
}));

// Minimal moderation tools. A real moderator screen comes later.
const mod = requireRole('moderator', 'admin');

reportsRouter.get('/admin/reports', mod, ah(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.target_type AS "targetType", r.target_id AS "targetId", r.reason,
            r.created_at AS "createdAt", p.body AS "postBody", p.status AS "postStatus"
       FROM reports r LEFT JOIN posts p ON r.target_type = 'post' AND p.id = r.target_id
      WHERE r.status = 'open' ORDER BY r.created_at LIMIT 100`,
  );
  res.json({ items: rows });
}));

reportsRouter.post('/admin/reports/:id/resolve', mod, ah(async (req, res) => {
  const { rowCount } = await pool.query(`UPDATE reports SET status = 'resolved' WHERE id = $1`, [z.string().uuid().parse(req.params.id)]);
  if (!rowCount) throw new HttpError(404, 'Report not found');
  res.json({ ok: true });
}));

reportsRouter.post('/admin/posts/:id/status', mod, ah(async (req, res) => {
  const { status } = z.object({ status: z.enum(['published', 'hidden', 'removed']) }).parse(req.body);
  await tx(async (c) => {
    const postId = z.string().uuid().parse(req.params.id);
    const p = await c.query('SELECT media_id FROM posts WHERE id=$1 FOR UPDATE', [postId]);
    if (!p.rowCount) throw new HttpError(404, 'Post not found');
    if (status === 'published' && p.rows[0].media_id && !(await c.query("SELECT 1 FROM post_media WHERE id=$1 AND state='approved'", [p.rows[0].media_id])).rowCount) {
      throw new HttpError(409, 'Review the attachment before publishing this post.');
    }
    await c.query('UPDATE posts SET status=$1::post_status WHERE id=$2', [status,postId]);
  });
  res.json({ ok: true });
}));

reportsRouter.get('/admin/media-pending', mod, ah(async (req, res) => {
  const { rows } = await pool.query(`${POST_SELECT} WHERE p.status='pending' AND m.state='pending' ORDER BY p.created_at,p.id LIMIT 50`, [(req as Authed).user!.id]);
  res.set('Cache-Control', 'private, no-store').json({ items: rows.map(({ cursorAt: _cursor, ...post }) => post) });
}));

reportsRouter.post('/admin/posts/:id/approve-media', mod, ah(async (req, res) => {
  await tx(async (c) => {
    const p = await c.query("SELECT media_id FROM posts WHERE id=$1 AND status='pending' FOR UPDATE", [z.string().uuid().parse(req.params.id)]);
    if (!p.rows[0]?.media_id) throw new HttpError(404, 'Pending media post not found');
    const m = await c.query("UPDATE post_media SET state='approved' WHERE id=$1 AND state='pending' AND storage_key IS NOT NULL RETURNING id", [p.rows[0].media_id]);
    if (!m.rowCount) throw new HttpError(409, 'This attachment is not ready for review.');
    await c.query("UPDATE posts SET status='published' WHERE id=$1", [req.params.id]);
  });
  res.json({ ok: true });
}));

// Posts the safety check flagged: a person should look at them before they can be featured.
reportsRouter.get('/admin/sensitive', mod, ah(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.body, p.created_at AS "createdAt", pr.display_name AS author
       FROM posts p JOIN profiles pr ON pr.user_id = p.author_id
      WHERE p.sensitive AND p.status = 'published' ORDER BY p.created_at DESC LIMIT 50`,
  );
  res.json({ items: rows });
}));

reportsRouter.post('/admin/posts/:id/clear-sensitive', mod, ah(async (req, res) => {
  const { rowCount } = await pool.query('UPDATE posts SET sensitive = false WHERE id = $1', [z.string().uuid().parse(req.params.id)]);
  if (!rowCount) throw new HttpError(404, 'Post not found');
  res.json({ ok: true });
}));
