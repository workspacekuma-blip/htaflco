import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { pool } from './db';
import { ah, HttpError } from './http';

export type Authed = Request & { user?: { id: string; role: string } };
const COOKIE = 'htafl_session';

export function signSession(res: Response, user: { id: string; role: string }) {
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE);
}

/** Reads the session cookie if present. Never blocks the request. */
export function readSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const p = jwt.verify(token, config.jwtSecret) as { sub: string; role: string };
      (req as Authed).user = { id: p.sub, role: p.role };
    } catch {
      /* expired or tampered: treat as signed out */
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!(req as Authed).user) return next(new HttpError(401, 'Sign in to continue'));
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = (req as Authed).user;
    if (!u) return next(new HttpError(401, 'Sign in to continue'));
    if (!roles.includes(u.role)) return next(new HttpError(403, 'Not allowed'));
    next();
  };
}

/** Registered members only: profile exists, account active, email verified (unless turned off). */
export const requireMember = ah(async (req, _res, next) => {
  const u = (req as Authed).user;
  if (!u) throw new HttpError(401, 'Sign in to continue');
  const { rows } = await pool.query(
    `SELECT u.email_verified, u.status, p.user_id AS has_profile
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [u.id],
  );
  const row = rows[0];
  if (!row || row.status !== 'active') throw new HttpError(403, 'This account is unavailable');
  if (!row.has_profile) throw new HttpError(403, 'Join The Creator Generation first');
  if (config.requireVerifiedEmail && !row.email_verified) throw new HttpError(403, 'Verify your email first');
  next();
});

/** Rate limit per signed-in member (falls back to IP). */
export const perUser = (limit: number, windowMs: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as Authed).user?.id ?? req.ip ?? 'anon',
  });
