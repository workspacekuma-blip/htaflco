import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { readSession } from './auth';
import { config } from './config';
import { pool } from './db';
import { ah, errorHandler } from './http';
import { authRouter } from './routes/auth';
import { feedsRouter } from './routes/feeds';
import { postsRouter } from './routes/posts';
import { mediaRouter } from './routes/media';
import { reportsRouter } from './routes/reports';
import { promptsRouter } from './routes/prompts';
import { notificationsRouter } from './routes/notifications';

export const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.use(helmet());
// A 10,000-character story can occupy 30 KB in UTF-8 (more when JSON-escaped).
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use(readSession);

// Block forged cross-site writes: browsers always send Origin on POST, PUT, PATCH and DELETE.
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (origin && origin !== config.appOrigin) return res.status(403).json({ error: 'Origin not allowed' });
  next();
});

app.get('/health', ah(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));
app.get('/stats', ah(async (_req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS members FROM profiles');
  res.json({ members: rows[0].members });
}));
app.use('/auth', authRouter);
app.use('/feed', feedsRouter);
app.use(postsRouter);
app.use(mediaRouter);
app.use(reportsRouter);
app.use(promptsRouter);
app.use(notificationsRouter);
app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => console.log(`HTAFL API listening on http://localhost:${config.port}`));
}
