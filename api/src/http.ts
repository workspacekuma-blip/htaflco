import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Lets async route handlers throw: errors reach the error handler instead of crashing. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid input', details: err.flatten().fieldErrors });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large. Shorten the post and try again.' });
  if (type === 'entity.parse.failed') return res.status(400).json({ error: 'The request could not be read. Try again.' });
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong' });
}
