import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Authed, clearSession, perUser, requireAuth, signSession } from '../auth';
import { sendVerification } from '../mailer';
import { pool, tx } from '../db';
import { ah, HttpError } from '../http';

export const CRAFTS = ['Art', 'Fashion', 'Music', 'Photography', 'Writing', 'Something else'] as const;

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12); // keeps login timing the same for unknown emails

const registerSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(100),
  displayName: z.string().trim().min(2).max(30),
  craft: z.enum(CRAFTS).default('Something else'),
  agree: z.literal(true), // the community promise
});

export const authRouter = Router();

authRouter.post('/register', limiter, ah(async (req, res) => {
  const b = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(b.password, 12);
  const token = randomBytes(24).toString('hex');
  let id: string;
  try {
    id = await tx(async (c) => {
      const u = await c.query(
        'INSERT INTO users (email, password_hash, verify_token) VALUES ($1, $2, $3) RETURNING id',
        [b.email, hash, token],
      );
      await c.query('INSERT INTO profiles (user_id, display_name, craft) VALUES ($1, $2, $3)', [
        u.rows[0].id, b.displayName, b.craft,
      ]);
      return u.rows[0].id as string;
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'That email is already registered');
    throw e;
  }
  await sendVerification(b.email, token);
  signSession(res, { id, role: 'member' });
  res.status(201).json({ id, displayName: b.displayName });
}));

authRouter.post('/login', limiter, ah(async (req, res) => {
  const { email, password } = z.object({
    email: z.string().email().transform((s) => s.toLowerCase()),
    password: z.string().min(1).max(100),
  }).parse(req.body);
  const { rows } = await pool.query('SELECT id, role, status, password_hash FROM users WHERE email = $1', [email]);
  const u = rows[0];
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok || u.status !== 'active') throw new HttpError(401, 'Wrong email or password');
  signSession(res, { id: u.id, role: u.role });
  res.json({ ok: true });
}));

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get('/verify', ah(async (req, res) => {
  const token = z.string().min(10).parse(req.query.token);
  const { rowCount } = await pool.query(
    'UPDATE users SET email_verified = true, verify_token = NULL WHERE verify_token = $1',
    [token],
  );
  if (!rowCount) throw new HttpError(400, 'That verification link is not valid');
  res.json({ ok: true });
}));

authRouter.post('/resend-verification', requireAuth, perUser(5, 3600_000), ah(async (req, res) => {
  const token = randomBytes(24).toString('hex');
  const { rows } = await pool.query(
    'UPDATE users SET verify_token = $1 WHERE id = $2 AND NOT email_verified RETURNING email',
    [token, (req as Authed).user!.id],
  );
  if (rows[0]) await sendVerification(rows[0].email, token);
  res.json({ ok: true });
}));

authRouter.get('/me', requireAuth, ah(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.email_verified AS "emailVerified", u.role,
            p.display_name AS "displayName", p.craft, p.joined_at AS "joinedAt"
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [(req as Authed).user!.id],
  );
  if (!rows[0]) throw new HttpError(404, 'Account not found');
  res.json(rows[0]);
}));

authRouter.patch('/me', requireAuth, ah(async (req, res) => {
  const b = z.object({
    displayName: z.string().trim().min(2).max(30).optional(),
    craft: z.enum(CRAFTS).optional(),
  }).parse(req.body);
  await pool.query(
    'UPDATE profiles SET display_name = COALESCE($1, display_name), craft = COALESCE($2, craft) WHERE user_id = $3',
    [b.displayName ?? null, b.craft ?? null, (req as Authed).user!.id],
  );
  res.json({ ok: true });
}));

/** Delete the account and, by cascade, everything the member posted. */
authRouter.delete('/me', requireAuth, ah(async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [(req as Authed).user!.id]);
  clearSession(res);
  res.json({ ok: true });
}));
