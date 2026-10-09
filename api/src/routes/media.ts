import { Router } from 'express';
import { z } from 'zod';
import { Authed, perUser, requireMember } from '../auth';
import { ah } from '../http';
import { MAX_BYTES, isMediaEnabled, manualReview, privateMedia, presignUpload, s3 } from '../media';
import { readableMedia } from '../private-media';
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from '../video';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import { HttpError } from '../http';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

export const mediaRouter = Router();

mediaRouter.get('/media/config', (_req, res) => {
  res.json({ enabled: isMediaEnabled(), maxBytes: MAX_BYTES, videoEnabled: isMediaEnabled() && privateMedia(), maxVideoBytes: MAX_VIDEO_BYTES, maxVideoSeconds: MAX_VIDEO_SECONDS, pendingReview: manualReview() });
});

mediaRouter.get('/media/assets/:id', ah(async (req, res) => {
  const asset = await readableMedia(z.string().uuid().parse(req.params.id), (req as Authed).user?.id ?? null);
  if (!s3) throw new HttpError(503, 'Media storage is unavailable.');
  const head = await s3.send(new HeadObjectCommand({ Bucket: config.s3Bucket, Key: asset.storage_key }));
  const size = head.ContentLength ?? 0;
  res.set({ 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'Content-Type': asset.kind === 'video' ? 'video/mp4' : 'image/jpeg', 'X-Content-Type-Options': 'nosniff' });
  let start = 0; let end = size - 1;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) { res.set('Content-Range', `bytes */${size}`).status(416).end(); return; }
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) { res.set('Content-Range', `bytes */${size}`).status(416).end(); return; }
    res.status(206).set('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  res.set('Content-Length', String(end - start + 1));
  if (req.method === 'HEAD') { res.end(); return; }
  const object = await s3.send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: asset.storage_key, Range: `bytes=${start}-${end}` }));
  if (!object.Body) throw new HttpError(404, 'Attachment not found');
  await pipeline(object.Body as Readable, res);
}));

mediaRouter.post('/media/upload-url', requireMember, perUser(30, 3600_000), ah(async (req, res) => {
  const { contentType } = z.object({ contentType: z.string() }).parse(req.body);
  res.json(await presignUpload((req as Authed).user!.id, contentType));
}));
