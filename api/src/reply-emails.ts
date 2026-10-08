import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { pool, tx } from './db';
import { HttpError } from './http';
import { replyEmailConfigured, sendReplyNotification } from './mailer';

// A notification link must never be accepted as an account session.
const unsubscribeKey = createHmac('sha256', config.jwtSecret).update('htafl-reply-email-unsubscribe').digest('hex');
export function replyUnsubscribeToken(userId: string) {
  return jwt.sign({ sub: userId, purpose: 'reply-email-unsubscribe' }, unsubscribeKey, { expiresIn: '30d' });
}
export async function unsubscribeReplyEmail(token: string) {
  let uid: string;
  try {
    const p = jwt.verify(token, unsubscribeKey, { algorithms: ['HS256'] }) as { sub: string; purpose: string };
    if (p.purpose !== 'reply-email-unsubscribe' || !/^[0-9a-f-]{36}$/.test(p.sub)) throw new Error('Invalid');
    uid = p.sub;
  } catch { throw new HttpError(400, 'This email preference link has expired. Sign in and open Notifications to change your settings.'); }
  await tx(async (c) => {
    await c.query('UPDATE users SET reply_email_enabled=false WHERE id=$1', [uid]);
    await c.query("UPDATE reply_notifications SET email_status='cancelled' WHERE recipient_id=$1 AND email_status IN ('pending','sending')", [uid]);
  });
}

/** Durable SMTP outbox: row locks claim work, stale claims recover after restart. */
export async function processReplyEmails() {
  if (!replyEmailConfigured) return;
  for (let i = 0; i < 5; i++) {
    const claimed = await tx(async (c) => {
      await c.query("UPDATE reply_notifications SET email_status='failed' WHERE email_attempts>=5 AND (email_status='pending' OR (email_status='sending' AND email_attempted_at<now()-interval '10 minutes'))");
      await c.query(`UPDATE reply_notifications n SET email_status='cancelled' WHERE email_status IN ('pending','sending') AND
        NOT EXISTS(SELECT 1 FROM users u JOIN comments cm ON cm.id=n.comment_id JOIN posts p ON p.id=cm.post_id
          WHERE u.id=n.recipient_id AND u.status='active' AND u.email_verified AND u.reply_email_enabled AND cm.status='published' AND p.status='published')`);
      const { rows } = await c.query(`SELECT n.id,n.recipient_id,u.email,cm.post_id,n.email_attempts FROM reply_notifications n
        JOIN users u ON u.id=n.recipient_id JOIN comments cm ON cm.id=n.comment_id
        WHERE n.email_attempts<5 AND ((n.email_status='pending' AND n.email_next_at<=now()) OR
          (n.email_status='sending' AND n.email_attempted_at<now()-interval '10 minutes'))
        ORDER BY n.created_at LIMIT 1 FOR UPDATE OF n SKIP LOCKED`);
      if (!rows[0]) return null;
      const row = rows[0];
      await c.query("INSERT INTO reply_email_budget(day) VALUES((now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING");
      const budget = await c.query("UPDATE reply_email_budget SET attempts=attempts+1 WHERE day=(now() AT TIME ZONE 'UTC')::date AND attempts<$1 RETURNING day", [config.replyEmailDailyLimit]);
      if (!budget.rowCount) return null;
      await c.query("UPDATE reply_notifications SET email_status='sending',email_attempts=email_attempts+1,email_attempted_at=now() WHERE id=$1", [row.id]);
      return { ...row, attempt: row.email_attempts + 1 };
    });
    if (!claimed) break;
    try {
      const active = await pool.query("SELECT 1 FROM reply_notifications n JOIN users u ON u.id=n.recipient_id WHERE n.id=$1 AND n.email_status='sending' AND u.reply_email_enabled AND u.status='active'", [claimed.id]);
      if (!active.rowCount) continue;
      await sendReplyNotification(claimed.email, claimed.post_id, replyUnsubscribeToken(claimed.recipient_id), claimed.id);
      await pool.query("UPDATE reply_notifications SET email_status='sent' WHERE id=$1 AND email_status='sending' AND email_attempts=$2", [claimed.id, claimed.attempt]);
    } catch (e) {
      const code = (e as { responseCode?: number }).responseCode ?? 0;
      const permanent = code >= 500 && code < 600;
      await pool.query(`UPDATE reply_notifications SET email_status=$2,email_next_at=now()+($3::int*interval '1 second')
        WHERE id=$1 AND email_status='sending' AND email_attempts=$4`, [claimed.id, permanent || claimed.attempt >= 5 ? 'failed' : 'pending', Math.min(3600, 60 * 2 ** (claimed.attempt - 1)), claimed.attempt]);
      console.error('Reply email delivery failed; outbox updated');
    }
  }
}

export function startReplyEmailLoop() {
  let current: Promise<void> | undefined;
  const start = () => { if (!current) current = processReplyEmails().catch(() => console.error('Reply email queue failed')).finally(() => { current = undefined; }); };
  start();
  const interval = setInterval(start, 60_000);
  return async () => { clearInterval(interval); await current; };
}
