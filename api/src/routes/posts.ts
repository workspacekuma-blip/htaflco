import { Router } from 'express';
import { z } from 'zod';
import { Authed, perUser, requireAuth, requireMember } from '../auth';
import { pool, tx } from '../db';
import { ah, HttpError } from '../http';
import { feedPage } from '../queries';
import { verifiedUrl } from '../media';
import { flagSensitive } from '../safety';

const id = z.string().uuid();
const uidOf = (req: unknown) => (req as Authed).user!.id;
export const PILLARS = ['Create', 'Overcome', 'Connect'] as const;

export const postsRouter = Router();

// Create a post. Craft comes from the member's profile.
postsRouter.post('/posts', requireMember, perUser(30, 3600_000), ah(async (req, res) => {
  const b = z.object({
    body: z.string().trim().min(1).max(240),
    pillar: z.enum(PILLARS).default('Create'),
    mediaKey: z.string().regex(/^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/).optional(),
  }).parse(req.body);
  const sensitive = flagSensitive(b.body);
  const mediaUrl = b.mediaKey ? await verifiedUrl(uidOf(req), b.mediaKey) : null;
  const { rows } = await pool.query(
    `INSERT INTO posts (author_id, body, pillar, craft, sensitive, media_url)
     SELECT $1, $2, $3::pillar, pr.craft, $4, $5 FROM profiles pr WHERE pr.user_id = $1
     RETURNING id`,
    [uidOf(req), b.body, b.pillar, sensitive, mediaUrl],
  );
  // supportNotice: the front end should show supportive resources for the member's region.
  res.status(201).json({ id: rows[0].id, supportNotice: sensitive });
}));

// Edit your own post's words.
postsRouter.patch('/posts/:id', requireMember, ah(async (req, res) => {
  const postId = id.parse(req.params.id);
  const { body } = z.object({ body: z.string().trim().min(1).max(240) }).parse(req.body);
  const { rowCount } = await pool.query(
    `UPDATE posts SET body = $1, edited_at = now(), sensitive = $2 WHERE id = $3 AND author_id = $4`,
    [body, flagSensitive(body), postId, uidOf(req)],
  );
  if (!rowCount) throw new HttpError(404, 'Post not found');
  res.json({ ok: true });
}));

// Authors delete their own posts. Moderators remove other people's (kept, but hidden).
postsRouter.delete('/posts/:id', requireAuth, ah(async (req, res) => {
  const postId = id.parse(req.params.id);
  const user = (req as Authed).user!;
  const { rows } = await pool.query('SELECT author_id FROM posts WHERE id = $1', [postId]);
  if (!rows[0]) throw new HttpError(404, 'Post not found');
  if (rows[0].author_id === user.id) {
    await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
  } else if (user.role === 'moderator' || user.role === 'admin') {
    await pool.query(`UPDATE posts SET status = 'removed' WHERE id = $1`, [postId]);
  } else {
    throw new HttpError(403, 'Not allowed');
  }
  res.json({ ok: true });
}));

// Your wall: all your own posts, newest first.
postsRouter.get('/me/wall', requireAuth, ah(async (req, res) => {
  const uid = uidOf(req);
  res.json(await feedPage(uid, [{ sql: 'p.author_id = ?::uuid', value: uid }], req.query.cursor, req.query.limit));
}));

// Vote: 1 = up, -1 = down, 0 = remove my vote. One vote per member per post, never on your own post.
postsRouter.put('/posts/:id/vote', requireMember, perUser(120, 3600_000), ah(async (req, res) => {
  const postId = id.parse(req.params.id);
  const { value } = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }).parse(req.body);
  const uid = uidOf(req);
  const result = await tx(async (c) => {
    // Locking the post row keeps its counters correct when many votes arrive together.
    const p = await c.query(`SELECT author_id FROM posts WHERE id = $1 AND status = 'published' FOR UPDATE`, [postId]);
    if (!p.rows[0]) throw new HttpError(404, 'Post not found');
    if (p.rows[0].author_id === uid) throw new HttpError(403, "You can't vote on your own post");
    const cur = (await c.query('SELECT value FROM votes WHERE post_id = $1 AND user_id = $2', [postId, uid])).rows[0]?.value ?? 0;
    if (value === 0) {
      await c.query('DELETE FROM votes WHERE post_id = $1 AND user_id = $2', [postId, uid]);
    } else {
      await c.query(
        `INSERT INTO votes (post_id, user_id, value) VALUES ($1, $2, $3)
         ON CONFLICT (post_id, user_id) DO UPDATE SET value = EXCLUDED.value, created_at = now()`,
        [postId, uid, value],
      );
    }
    const dUp = (value === 1 ? 1 : 0) - (cur === 1 ? 1 : 0);
    const dDown = (value === -1 ? 1 : 0) - (cur === -1 ? 1 : 0);
    const u = await c.query('UPDATE posts SET up = up + $1, down = down + $2 WHERE id = $3 RETURNING up, down', [dUp, dDown, postId]);
    return u.rows[0] as { up: number; down: number };
  });
  res.json({ ...result, score: result.up - result.down, myVote: value || null });
}));

// Comments (oldest first). TODO: paginate once threads get long.
postsRouter.get('/posts/:id/comments', ah(async (req, res) => {
  const postId = id.parse(req.params.id);
  const post = await pool.query("SELECT 1 FROM posts WHERE id = $1 AND status = 'published'", [postId]);
  if (!post.rowCount) throw new HttpError(404, 'Post not found');
  const { rows } = await pool.query(
    `SELECT c.id, c.body, c.created_at AS "createdAt", pr.display_name AS author
       FROM comments c JOIN profiles pr ON pr.user_id = c.author_id
      WHERE c.post_id = $1 AND c.status = 'published'
      ORDER BY c.created_at, c.id LIMIT 100`,
    [postId],
  );
  res.json({ items: rows });
}));

postsRouter.post('/posts/:id/comments', requireMember, perUser(60, 3600_000), ah(async (req, res) => {
  const postId = id.parse(req.params.id);
  const { body } = z.object({ body: z.string().trim().min(1).max(500) }).parse(req.body);
  const commentId = await tx(async (c) => {
    const p = await c.query(`SELECT 1 FROM posts WHERE id = $1 AND status = 'published'`, [postId]);
    if (!p.rows[0]) throw new HttpError(404, 'Post not found');
    const r = await c.query('INSERT INTO comments (post_id, author_id, body) VALUES ($1, $2, $3) RETURNING id', [postId, uidOf(req), body]);
    await c.query('UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1', [postId]);
    return r.rows[0].id as string;
  });
  res.status(201).json({ id: commentId });
}));
