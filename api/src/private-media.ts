import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { config } from './config';
import { pool, tx } from './db';
import { HttpError } from './http';
import { readBytes, readValidatedPicture, s3 } from './media';
import { MAX_VIDEO_BYTES, validateVideo } from './video';

export async function prepareMedia(ownerId: string, key: string): Promise<string> {
  if (!s3) throw new HttpError(503, 'Media storage is unavailable.');
  const asset = await tx(async (c) => {
    const r = await c.query(`SELECT m.* FROM post_media m WHERE owner_id=$1 AND source_key=$2 FOR UPDATE`, [ownerId, key]);
    const row = r.rows[0];
    if (!row || (await c.query('SELECT 1 FROM posts WHERE media_id=$1', [row.id])).rowCount) throw new HttpError(400, 'This attachment is unavailable. Upload a new file.');
    if (row.state === 'pending') return row;
    if (row.state !== 'uploading' && !(row.state === 'processing' && Date.now() - new Date(row.updated_at).getTime() > 300_000)) throw new HttpError(409, 'That attachment is being processed. Try again shortly.');
    await c.query("UPDATE post_media SET state='processing',updated_at=now() WHERE id=$1", [row.id]);
    return row;
  });
  if (asset.state === 'pending') return asset.id as string;
  try {
    let bytes: Buffer;
    if (asset.kind === 'picture') bytes = await readValidatedPicture(ownerId, key);
    else {
      const head = await s3.send(new HeadObjectCommand({ Bucket: config.s3Bucket, Key: key })).catch(() => null);
      if (!head || head.ContentType !== 'video/mp4' || !head.ContentLength || head.ContentLength > MAX_VIDEO_BYTES) throw new HttpError(400, 'Use an uploaded MP4 up to 10 MB.');
      const object = await s3.send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: key, Range: `bytes=0-${MAX_VIDEO_BYTES}` }));
      if (!object.Body) throw new HttpError(400, 'Video upload not found.');
      bytes = await validateVideo(await readBytes(object.Body as Readable, MAX_VIDEO_BYTES));
    }
    // Browser links authorize uploads/ only. Validated keys are server-generated and private.
    const storageKey = asset.storage_key ?? `validated/${ownerId}/${randomUUID()}.${asset.kind === 'video' ? 'mp4' : 'jpg'}`;
    // Record the destination before writing so interrupted saves are recoverable/cleanable.
    await pool.query('UPDATE post_media SET storage_key=$2 WHERE id=$1', [asset.id,storageKey]);
    await s3.send(new PutObjectCommand({ Bucket: config.s3Bucket, Key: storageKey, Body: bytes,
      ContentType: asset.kind === 'video' ? 'video/mp4' : 'image/jpeg' }));
    await pool.query("UPDATE post_media SET storage_key=$2,state='pending',updated_at=now() WHERE id=$1", [asset.id, storageKey]);
    return asset.id as string;
  } catch (e) {
    await pool.query("UPDATE post_media SET state='uploading' WHERE id=$1 AND state='processing'", [asset.id]);
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, 'The attachment could not be processed. Your draft is kept; try again.');
  }
}

/** Supabase S3 has no lifecycle rules. Only unattached assets older than a day expire. */
export async function cleanupUnattachedMedia() {
  if (!s3) return;
  await tx(async (c) => {
    const assets = await c.query(`SELECT m.*,EXISTS (SELECT 1 FROM posts p WHERE p.media_id=m.id) AS attached
      FROM post_media m WHERE updated_at < now()-interval '1 day'
      AND (NOT source_cleaned OR NOT EXISTS (SELECT 1 FROM posts p WHERE p.media_id=m.id)) ORDER BY updated_at LIMIT 20 FOR UPDATE SKIP LOCKED`);
    for (const asset of assets.rows) {
      for (const key of [asset.source_cleaned ? null : asset.source_key, asset.attached ? null : asset.storage_key].filter(Boolean)) {
        await s3!.send(new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: key }));
      }
      if (asset.attached) await c.query('UPDATE post_media SET source_cleaned=true WHERE id=$1', [asset.id]);
      else await c.query('DELETE FROM post_media WHERE id=$1', [asset.id]);
    }
  });
}

export function startMediaCleanupLoop() {
  let running: Promise<void> | undefined;
  const tick = () => { if (!running) running = cleanupUnattachedMedia().catch(() => console.error('Temporary media cleanup failed; will retry.')).finally(() => { running = undefined; }); };
  tick(); const timer = setInterval(tick, 3600_000); timer.unref();
  return async () => { clearInterval(timer); await running; };
}

/** Re-check database permissions on every GET/HEAD, including video range requests. */
export async function readableMedia(assetId: string, viewerId: string | null) {
  const { rows } = await pool.query(`SELECT m.storage_key,m.kind,p.status,m.state,
    (u.status='active' AND (p.author_id=u.id OR u.role IN ('moderator','admin'))) AS private_access
    FROM post_media m JOIN posts p ON p.media_id=m.id LEFT JOIN users u ON u.id=$2
    WHERE m.id=$1`, [assetId, viewerId]);
  const row = rows[0];
  if (!row?.storage_key || !((row.status === 'published' && row.state === 'approved') ||
      (row.status === 'pending' && row.private_access))) throw new HttpError(404, 'Attachment not found');
  return row as { storage_key: string; kind: string };
}
