import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import sharp from 'sharp';
import { config } from './config';
import { HttpError } from './http';
import { pool } from './db';

export const storageConfigured = Boolean(
  config.s3Bucket && config.s3AccessKeyId && config.s3SecretAccessKey,
);
// No unsafe-content provider has been selected. Never publish unscanned production pictures.
export const mediaEnabled = storageConfigured && !config.isProd;
export const manualReview = () => config.mediaReviewMode === 'manual';
export const isMediaEnabled = () => storageConfigured && (manualReview() || !config.isProd);
export const MAX_BYTES = 2_000_000;
const MAX_PIXELS = 16_000_000;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FORMATS: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const s3 = storageConfigured
  ? new S3Client({
      region: config.s3Region,
      endpoint: config.s3Endpoint || undefined,
      forcePathStyle: Boolean(config.s3Endpoint),
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 15_000 },
      credentials: { accessKeyId: config.s3AccessKeyId, secretAccessKey: config.s3SecretAccessKey },
    })
  : null;

/** A short-lived link the browser uses to upload one picture straight to storage. */
export async function presignUpload(userId: string, contentType: string) {
  if (config.isProd && !manualReview()) throw new HttpError(503, 'Media publishing is pending production review setup.');
  if (!s3) throw new HttpError(501, 'Picture upload is not set up');
  const ext = TYPES[contentType] ?? (manualReview() && contentType === 'video/mp4' ? 'mp4' : undefined);
  if (!ext) throw new HttpError(400, 'Use a JPEG, PNG, WebP picture or MP4 video');
  const key = `uploads/${userId}/${randomUUID()}.${ext}`;
  if (manualReview()) await pool.query('INSERT INTO post_media(owner_id,source_key,kind) VALUES($1,$2,$3)', [userId, key, ext === 'mp4' ? 'video' : 'picture']);
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: config.s3Bucket, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
  return { key, url };
}

export async function readBytes(stream: Readable, maxBytes = MAX_BYTES): Promise<Buffer> {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const b = Buffer.from(chunk);
      size += b.length;
      if (size > maxBytes) throw new HttpError(400, 'That attachment is too large');
      chunks.push(b);
    }
    return Buffer.concat(chunks);
  } finally {
    stream.destroy();
  }
}

/** Validation only: operator tools may prepare private quarantine even while publishing is off. */
export async function readValidatedPicture(userId: string, key: string): Promise<Buffer> {
  if (!s3) throw new HttpError(501, 'Picture upload is not set up');
  if (!key.startsWith(`uploads/${userId}/`) || !/^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) {
    throw new HttpError(400, 'Invalid picture');
  }
  const head = await s3.send(new HeadObjectCommand({ Bucket: config.s3Bucket, Key: key })).catch(() => null);
  if (!head) throw new HttpError(400, 'Picture upload not found. Try again');
  if ((head.ContentLength ?? 0) > MAX_BYTES) throw new HttpError(400, 'That picture is too large');
  if (!head.ContentType || !TYPES[head.ContentType]) throw new HttpError(400, 'Use a JPEG, PNG or WebP picture');
  const object = await s3.send(new GetObjectCommand({
    Bucket: config.s3Bucket, Key: key, Range: `bytes=0-${MAX_BYTES}`,
  })).catch(() => null);
  if (!object?.Body) throw new HttpError(400, 'Picture upload not found. Try again');
  const bytes = await readBytes(object.Body as Readable);
  let picture: Buffer;
  try {
    // Reject other formats before giving untrusted bytes to any SVG/PDF/etc. decoder.
    const signatureType = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'image/jpeg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
    if (!signatureType || signatureType !== object.ContentType) throw new Error('Unsupported picture');
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_PIXELS });
    const metadata = await image.metadata();
    const actualType = FORMATS[metadata.format ?? ''];
    if (!actualType || actualType !== object.ContentType ||
        !key.endsWith(`.${TYPES[actualType]}`) || (metadata.pages ?? 1) !== 1) {
      throw new Error('Unsupported picture');
    }
    // Full decoding/re-encoding rejects damaged pixel data and removes embedded metadata.
    picture = await image.rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).timeout({ seconds: 5 }).toBuffer();
  } catch {
    throw new HttpError(400, 'That picture could not be read. Use a valid, still JPEG, PNG or WebP up to 16 megapixels.');
  }
  if (picture.length > MAX_BYTES) throw new HttpError(400, 'That picture is too large');
  return picture;
}

/** Decode staging bytes and publish a new server-owned JPEG; signed PUTs cannot change it. */
export async function verifiedUrl(userId: string, key: string): Promise<string> {
  if (config.isProd) throw new HttpError(503, 'Picture publishing is pending production scanning setup.');
  const picture = await readValidatedPicture(userId, key);
  if (!s3) throw new HttpError(501, 'Picture upload is not set up');
  // Only staging uploads/ keys are presigned. Published pictures/ keys are freshly generated
  // and written by the server, so replaying or racing an upload cannot replace an attachment.
  const publishedKey = `pictures/${userId}/${randomUUID()}.jpg`;
  await s3.send(new PutObjectCommand({
    Bucket: config.s3Bucket, Key: publishedKey, Body: picture, ContentType: 'image/jpeg', IfNoneMatch: '*',
  })).catch(() => { throw new HttpError(503, 'The picture could not be saved. Try again.'); });
  return `${config.s3PublicBase.replace(/\/$/, '')}/${publishedKey}`;
}

/** Private preparation only. Never updates a post or returns a public URL. */
export async function prepareLegacyPicture(userId: string, sourceKey: string, postId: string) {
  if (!/^[0-9a-f-]{36}$/.test(postId)) throw new HttpError(400, 'Invalid post');
  const picture = await readValidatedPicture(userId, sourceKey);
  if (!s3) throw new HttpError(501, 'Picture upload is not set up');
  const sha256 = createHash('sha256').update(picture).digest('hex');
  const key = `quarantine/legacy/${postId}/${sha256}.jpg`;
  try {
    await s3.send(new PutObjectCommand({ Bucket: config.s3Bucket, Key: key, Body: picture,
      ContentType: 'image/jpeg', IfNoneMatch: '*', Metadata: { sha256 } }));
  } catch (e) {
    if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw e;
    const existing = await s3.send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: key, Range: `bytes=0-${MAX_BYTES}` }));
    if (!existing.Body || createHash('sha256').update(await readBytes(existing.Body as Readable)).digest('hex') !== sha256) {
      throw new HttpError(503, 'The existing quarantined picture does not match. Stop and review it.');
    }
  }
  return { key, sha256 };
}
