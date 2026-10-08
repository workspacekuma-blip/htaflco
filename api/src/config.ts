import 'dotenv/config';

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: need('DATABASE_URL'),
  jwtSecret: need('JWT_SECRET'),
  isProd: process.env.NODE_ENV === 'production',
  requireVerifiedEmail: (process.env.REQUIRE_VERIFIED_EMAIL ?? 'true') !== 'false',
  featuredMinVoters: Number(process.env.FEATURED_MIN_VOTERS ?? 3),
  risingMinVoters: Number(process.env.RISING_MIN_VOTERS ?? 3),
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:3001',
  smtpUrl: process.env.SMTP_URL ?? '',
  mailFrom: process.env.MAIL_FROM ?? 'HTAFL <no-reply@example.com>',
  s3Endpoint: process.env.S3_ENDPOINT ?? '',
  s3Region: process.env.S3_REGION ?? 'auto',
  s3Bucket: process.env.S3_BUCKET ?? '',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  s3PublicBase: process.env.S3_PUBLIC_BASE ?? '',
};
