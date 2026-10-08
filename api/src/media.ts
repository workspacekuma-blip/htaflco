import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { config } from './config';
import { HttpError } from './http';

export const mediaEnabled = Boolean(
  config.s3Bucket && config.s3AccessKeyId && config.s3SecretAccessKey && config.s3PublicBase,
);
export const MAX_BYTES = 2_000_000;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

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

/** Checks the uploaded picture is the member's own, the right type and small enough; returns its public URL. */
export async function verifiedUrl(userId: string, key: string): Promise<string> {
  if (!s3) throw new HttpError(501, 'Picture upload is not set up');
  if (!key.startsWith(`uploads/${userId}/`)) throw new HttpError(400, 'Invalid picture');
  const head = await s3.send(new HeadObjectCommand({ Bucket: config.s3Bucket, Key: key })).catch(() => null);
  if (!head) throw new HttpError(400, 'Picture upload not found. Try again');
  if ((head.ContentLength ?? 0) > MAX_BYTES) throw new HttpError(400, 'That picture is too large');
  if (!head.ContentType || !TYPES[head.ContentType]) throw new HttpError(400, 'Use a JPEG, PNG or WebP picture');
  return `${config.s3PublicBase.replace(/\/$/, '')}/${key}`;
}
