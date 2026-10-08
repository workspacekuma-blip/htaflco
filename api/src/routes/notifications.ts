import { Router } from 'express';
import { z } from 'zod';
import { Authed, requireAuth, requireMember } from '../auth';
import { config } from '../config';
import { pool, tx } from '../db';
import { ah, HttpError } from '../http';
import { decodeCursor, encodeCursor } from '../queries';
import { unsubscribeReplyEmail } from '../reply-emails';

export const notificationsRouter = Router();
const joins = `FROM reply_notifications n JOIN comments c ON c.id=n.comment_id JOIN posts p ON p.id=c.post_id JOIN profiles pr ON pr.user_id=c.author_id`;
const visible = `n.recipient_id=$1 AND c.status='published' AND p.status='published'`;

notificationsRouter.get('/me/notifications', requireAuth, ah(async (req, res) => {
  const uid = (req as Authed).user!.id;
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const params: unknown[] = [uid];
  let cursorClause = '';
  const cur = decodeCursor(req.query.cursor);
  if (cur) { params.push(cur.at, cur.id); cursorClause = ' AND (n.created_at,n.id)<($2::timestamptz,$3::uuid)'; }
  params.push(limit + 1);
  const { rows } = await pool.query(`SELECT n.id,c.post_id AS "postId",p.title AS "postTitle",pr.display_name AS author,c.body,
    n.created_at AS "createdAt",n.read_at AS "readAt",to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
    ${joins} WHERE ${visible}${cursorClause} ORDER BY n.created_at DESC,n.id DESC LIMIT $${params.length}`, params);
  const items = rows.slice(0, limit); const last = items[items.length - 1];
  const count = await pool.query(`SELECT count(*)::int AS count ${joins} WHERE ${visible} AND n.read_at IS NULL`, [uid]);
  res.set('Cache-Control', 'private, no-store').json({ items: items.map(({ cursorAt: _c, ...row }) => row), unreadCount: count.rows[0].count, nextCursor: rows.length > limit && last ? encodeCursor(last.cursorAt, last.id) : null });
}));

notificationsRouter.post('/me/notifications/:id/read', requireAuth, ah(async (req, res) => {
  const { rowCount } = await pool.query(`UPDATE reply_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$2 AND recipient_id=$1`, [(req as Authed).user!.id, z.string().uuid().parse(req.params.id)]);
  if (!rowCount) throw new HttpError(404, 'Notification not found');
  res.json({ ok: true });
}));

notificationsRouter.get('/me/notification-preferences', requireAuth, ah(async (req, res) => {
  const { rows } = await pool.query('SELECT reply_email_enabled AS "replyEmail" FROM users WHERE id=$1', [(req as Authed).user!.id]);
  res.set('Cache-Control', 'private, no-store').json(rows[0]);
}));

notificationsRouter.patch('/me/notification-preferences', requireMember, ah(async (req, res) => {
  const { replyEmail } = z.object({ replyEmail: z.boolean() }).parse(req.body);
  if (replyEmail && config.isProd && !config.smtpUrl) throw new HttpError(503, 'Reply emails are not configured yet. In-app notifications remain available.');
  const uid = (req as Authed).user!.id;
  await tx(async (c) => {
    await c.query('UPDATE users SET reply_email_enabled=$1,reply_email_consented_at=CASE WHEN $1 THEN now() ELSE reply_email_consented_at END WHERE id=$2', [replyEmail, uid]);
    if (!replyEmail) await c.query("UPDATE reply_notifications SET email_status='cancelled' WHERE recipient_id=$1 AND email_status IN ('pending','sending')", [uid]);
  });
  res.json({ replyEmail });
}));

// GET links never change settings: mail scanners cannot unsubscribe a member accidentally.
notificationsRouter.post('/notifications/email-unsubscribe', ah(async (req, res) => {
  const { token } = z.object({ token: z.string().max(1000) }).parse(req.body);
  await unsubscribeReplyEmail(token);
  res.json({ ok: true });
}));
