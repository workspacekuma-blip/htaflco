// Operator tool. Default is read-only. --prepare writes quarantine only, never posts/passwords.
import 'dotenv/config';
import { open } from 'node:fs/promises';
import { config } from '../src/config';
import { pool } from '../src/db';
import { HttpError } from '../src/http';
import { legacyPictureKey, passwordHashKind } from '../src/legacy';
import { prepareLegacyPicture } from '../src/media';

async function main() {
  const args = process.argv.slice(2);
  const preparing = args.includes('--prepare');
  const outputIndex = args.indexOf('--output');
  const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
  const known = new Set(['--prepare', '--dry-run', '--output', ...(output ? [output] : [])]);
  if (args.some((a) => !known.has(a)) || (preparing && args.includes('--dry-run')) ||
      (preparing && (!output || !output.endsWith('.local.json'))) || (!preparing && outputIndex >= 0)) {
    throw new Error('Usage: npm run legacy:audit -- [--dry-run | --prepare --output PATH.local.json]');
  }
  const hashes = (await pool.query('SELECT password_hash FROM users')).rows;
  const passwords = { bcrypt: 0, weakBcrypt: 0, unsupported: 0, originalByteLengthUnknown: hashes.length };
  for (const u of hashes) {
    const kind = passwordHashKind(u.password_hash);
    if (kind === 'bcrypt') passwords.bcrypt++;
    else if (kind === 'weak-bcrypt') passwords.weakBcrypt++;
    else passwords.unsupported++;
  }
  const posts = (await pool.query(`SELECT id,author_id,media_url,status FROM posts WHERE media_url IS NOT NULL ORDER BY id`)).rows;
  const candidates = posts.map((p) => ({ ...p, sourceKey: legacyPictureKey(p.media_url, p.author_id, config.s3PublicBase) }));
  const summary = { mode: preparing ? 'quarantine-preparation' : 'read-only', picturePosts: posts.length,
    legacyPictures: candidates.filter((p) => p.sourceKey).length,
    otherPictureUrls: candidates.filter((p) => !p.sourceKey).length, passwords, prepared: 0, blocked: 0,
    postsUpdated: 0, passwordsChanged: 0, scanningActivated: false };
  if (!preparing) { console.log(JSON.stringify(summary, null, 2)); return; }
  // Refuse to overwrite an existing manifest. Checkpoint each item for partial-failure recovery.
  const file = await open(output!, 'wx', 0o600);
  const manifest = { version: 1, generatedAt: new Date().toISOString(), summary,
    entries: [] as Record<string, unknown>[] };
  const checkpoint = async () => {
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2));
    await file.truncate(0); await file.write(bytes, 0, bytes.length, 0); await file.sync();
  };
  try {
    await checkpoint();
    for (const p of candidates.filter((p) => p.sourceKey)) {
      const entry: Record<string, unknown> = { postId: p.id, authorId: p.author_id, originalMediaUrl: p.media_url,
        originalPostStatus: p.status, sourceKey: p.sourceKey };
      try {
        const prepared = await prepareLegacyPicture(p.author_id, p.sourceKey!, p.id);
        Object.assign(entry, { state: 'awaiting-scan', quarantineKey: prepared.key, sha256: prepared.sha256 });
        summary.prepared++;
      } catch (e) {
        Object.assign(entry, { state: 'blocked', reason: e instanceof HttpError ? e.message : 'Preparation failed. Check storage access and review this item.' });
        summary.blocked++;
      }
      manifest.entries.push(entry); await checkpoint();
    }
  } finally { await file.close(); }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.blocked) process.exitCode = 1;
}

main().catch((e) => { console.error(e instanceof Error ? e.message : 'Legacy audit failed'); process.exitCode = 1; })
  .finally(() => pool.end());
