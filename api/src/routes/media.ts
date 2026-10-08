import { Router } from 'express';
import { z } from 'zod';
import { Authed, perUser, requireMember } from '../auth';
import { ah } from '../http';
import { MAX_BYTES, mediaEnabled, presignUpload } from '../media';

export const mediaRouter = Router();

mediaRouter.get('/media/config', (_req, res) => {
  res.json({ enabled: mediaEnabled, maxBytes: MAX_BYTES });
});

mediaRouter.post('/media/upload-url', requireMember, perUser(30, 3600_000), ah(async (req, res) => {
  const { contentType } = z.object({ contentType: z.string() }).parse(req.body);
  res.json(await presignUpload((req as Authed).user!.id, contentType));
}));
