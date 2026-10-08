import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import sharp from 'sharp';
import { config } from './config';
import { HttpError } from './http';

export const mediaEnabled = Boolean(
  config.s3Bucket && config.s3AccessKeyId && config.s3SecretAccessKey && config.s3PublicBase,
);
export const MAX_BYTES = 2_000_000;
const MAX_PIXELS = 16_000_000;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FORMATS: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const s3 = mediaEnabled
  ? new S3Client({
      region: config.s3Region,
      endpoint: config.s3Endpoint || undefined,
      forcePathStyle: Boolean(config.s3Endpoint),
      credentials: { accessKeyId: config.s3AccessKeyId, secretAccessKey: config.s3SecretAccessKey },
    })
  : null;

/** A short-lived link the browser uses to upload one picture straight to storage. */
export async function presignUpload(userId: string, contentType: string) {
  if (!s3) throw new HttpError(501, 'Picture upload is not set up');
  const ext = TYPES[contentType];
  if (!ext) throw new HttpError(400, 'Use a JPEG, PNG or WebP picture');
  const key = `uploads/${userId}/${randomUUID()}.${ext}`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: config.s3Bucket, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
  return { key, url };
}

/** Decode staging bytes and publish a new server-owned JPEG; signed PUTs cannot change it. */
export async function verifiedUrl(userId: string, key: string): Promise<string> {
  if (!s3) throw new HttpError(501, 'Picture upload is not set up');
  if (!key.startsWith(`uploads/${userId}/`)) throw new HttpError(400, 'Invalid picture');
  const head = await s3.send(new HeadObjectCommand({ Bucket: config.s3Bucket, Key: key })).catch(() => null);
  if (!head) throw new HttpError(400, 'Picture upload not found. Try again');
  if ((head.ContentLength ?? 0) > MAX_BYTES) throw new HttpError(400, 'That picture is too large');
  if (!head.ContentType || !TYPES[head.ContentType]) throw new HttpError(400, 'Use a JPEG, PNG or WebP picture');
  const object = await s3.send(new GetObjectCommand({
    Bucket: config.s3Bucket, Key: key, Range: `bytes=0-${MAX_BYTES}`,
  })).catch(() => null);
  if (!object?.Body) throw new HttpError(400, 'Picture upload not found. Try again');
  const stream = object.Body as Readable;
  let bytes: Buffer;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const b = Buffer.from(chunk);
      size += b.length;
      if (size > MAX_BYTES) throw new HttpError(400, 'That picture is too large');
      chunks.push(b);
    }
    bytes = Buffer.concat(chunks);
  } finally {
    stream.destroy();
  }
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
  // Only staging uploads/ keys are presigned. Published pictures/ keys are freshly generated
  // and written by the server, so replaying or racing an upload cannot replace an attachment.
  const publishedKey = `pictures/${userId}/${randomUUID()}.jpg`;
  await s3.send(new PutObjectCommand({
    Bucket: config.s3Bucket, Key: publishedKey, Body: picture, ContentType: 'image/jpeg', IfNoneMatch: '*',
  })).catch(() => { throw new HttpError(503, 'The picture could not be saved. Try again.'); });
  return `${config.s3PublicBase.replace(/\/$/, '')}/${publishedKey}`;
}
