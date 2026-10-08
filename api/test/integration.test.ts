import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, before, beforeEach, test } from 'node:test';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

// Fail closed: never fall back to the development or production database.
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('Set TEST_DATABASE_URL to a dedicated database whose name ends in _test. Tests clear that database.');
}
if (url === process.env.DATABASE_URL) throw new Error('Test and application databases must differ');
process.env.DATABASE_URL = url;
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.REQUIRE_VERIFIED_EMAIL = 'true';
process.env.APP_ORIGIN = 'http://localhost:3001';
process.env.FEATURED_MIN_VOTERS = '3';
process.env.RISING_MIN_VOTERS = '3';
const { app } = require('../src/server') as typeof import('../src/server');
const { pool } = require('../src/db') as typeof import('../src/db');
const { computeFeatured, computeRising } = require('../src/ranking/worker') as typeof import('../src/ranking/worker');
let server: Server;
let base: string;
type User = { id: string; cookie: string };

before(async () => {
  const bootstrap = new Pool({ connectionString: url });
  await bootstrap.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await bootstrap.query(readFileSync('db/schema.sql', 'utf8'));
  await bootstrap.end();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  await pool.end();
});
beforeEach(async () => {
  await pool.query('TRUNCATE users, ranking_snapshots, featured_archive CASCADE');
});
async function user(verified = true, role = 'member'): Promise<User> {
  const { rows } = await pool.query(
    `INSERT INTO users(email,password_hash,email_verified,role,created_at)
     VALUES ($1,'test-only-not-a-login-hash',$2,$3,now()-interval '2 days') RETURNING id`,
    [`${randomBytes(8).toString('hex')}@example.test`, verified, role],
  );
  const id = rows[0].id;
  await pool.query("INSERT INTO profiles(user_id,display_name,craft) VALUES($1,'Test member','Art')", [id]);
  return { id, cookie: `htafl_session=${jwt.sign({ sub: id, role }, process.env.JWT_SECRET!, { expiresIn: '1h' })}` };
}
async function post(author: User, body = 'Test-only post') {
  return (await pool.query('INSERT INTO posts(author_id,body,pillar,craft) VALUES($1,$2,\'Create\',\'Art\') RETURNING id', [author.id, body])).rows[0].id as string;
}
async function request(path: string, method = 'GET', u?: User, body?: unknown, origin = 'http://localhost:3001') {
  const response = await fetch(base + path, { method, headers: {
    origin, 'content-type': 'application/json', ...(u ? { cookie: u.cookie } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}
async function vote(id: string, u: User, value: number) { return request(`/posts/${id}/vote`, 'PUT', u, { value }); }
async function counters(id: string) {
  return (await pool.query('SELECT up,down FROM posts WHERE id=$1', [id])).rows[0];
}

test('health connects to real PostgreSQL', async () => {
  assert.deepEqual(await request('/health'), { status: 200, body: { ok: true } });
});
test('shared free host starts API and rankings and closes database connections', async () => {
  const result = await promisify(execFile)(process.execPath, ['--require', 'tsx/cjs', '-e', `
    const assert=require('node:assert/strict');
    const {startHostedServer}=require('./src/hosted'); const {pool}=require('./src/db');
    (async()=>{
      const host=await startHostedServer(0,'127.0.0.1');
      try {
        const base='http://127.0.0.1:'+host.server.address().port;
        assert.equal((await fetch(base+'/health')).status,200);
        assert.equal((await fetch(base+'/posts',{method:'POST',headers:{origin:process.env.APP_ORIGIN,'content-type':'application/json'},body:'{}'})).status,401);
        assert.equal((await fetch(base+'/posts',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'})).status,403);
        const signup=await fetch(base+'/auth/register',{method:'POST',headers:{origin:process.env.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify({email:'hosted@example.test',password:'hosted-test-password',displayName:'Hosted test',agree:true})});
        assert.equal(signup.status,503);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE email='hosted@example.test'")).rows[0].n,0);
        assert.deepEqual((await pool.query('SELECT kind FROM ranking_snapshots ORDER BY kind')).rows.map(r=>r.kind),['featured','rising']);
      } finally {await host.close()}
      assert.equal(pool.ended,true); console.log('shared host verified');
    })().catch(e=>{console.error(e);process.exit(1)});
  `], { env: { ...process.env, NODE_ENV: 'production', SMTP_URL: '' }, timeout: 15000 });
  assert.match(result.stdout, /shared host verified/);
  assert.doesNotMatch(result.stdout, /verify\?token=/);
});
test('production picture publishing stays disabled until a scanning provider is implemented', async () => {
  await promisify(execFile)(process.execPath, ['--require', 'tsx/cjs', '-e', `
    const assert=require('node:assert/strict'); const media=require('./src/media');
    assert.equal(media.mediaEnabled,false);
    Promise.all([
      assert.rejects(media.presignUpload('test','image/jpeg'),e=>e.status===503),
      assert.rejects(media.verifiedUrl('test','uploads/test/image.jpg'),e=>e.status===503)
    ]).catch(e=>{console.error(e);process.exit(1)});
  `], { env: { ...process.env, NODE_ENV: 'production' }, timeout: 15000 });
});

test('production email delivery failure is reported without logging a verification token', async () => {
  const result = await promisify(execFile)(process.execPath, ['--require', 'tsx/cjs', '-e', `
    const assert=require('node:assert/strict'); const net=require('node:net');
    (async()=>{
      const smtp=net.createServer(socket=>socket.end('421 Temporary delivery failure\\r\\n'));
      await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));
      process.env.SMTP_URL='smtp://127.0.0.1:'+smtp.address().port;
      const {sendVerification}=require('./src/mailer');
      try {await assert.rejects(sendVerification('delivery@example.test','test-only-verification-token'),e=>e.status===503)}
      finally {await new Promise(resolve=>smtp.close(resolve))}
      console.log('delivery failure verified');
    })().catch(e=>{console.error(e);process.exit(1)});
  `], { env: { ...process.env, NODE_ENV: 'production' }, timeout: 15000 });
  assert.match(result.stdout, /delivery failure verified/);
  assert.doesNotMatch(result.stdout + result.stderr, /test-only-verification-token|verify\?token=/);
});
test('password limits reject bcrypt truncation in registration and login, including UTF-8', async () => {
  for (const password of ['a'.repeat(73), '🔐'.repeat(19)]) {
    const email = `${randomBytes(8).toString('hex')}@example.test`;
    const r = await request('/auth/register', 'POST', undefined, { email, password, displayName: 'Password QA', agree: true });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /72 bytes/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM users WHERE email=$1', [email])).rows[0].n, 0);
    assert.equal((await request('/auth/login', 'POST', undefined, { email, password })).status, 400);
  }
  for (const password of ['a'.repeat(72), '🔐'.repeat(18)]) {
    const email = `${randomBytes(8).toString('hex')}@example.test`;
    assert.equal((await request('/auth/register', 'POST', undefined, { email, password, displayName: 'Password QA', agree: true })).status, 201);
    assert.equal((await request('/auth/login', 'POST', undefined, { email, password })).status, 200);
    assert.equal((await request('/auth/login', 'POST', undefined, { email, password: password + 'suffix' })).status, 400);
    const different = password.startsWith('a') ? 'b' + password.slice(1) : '🔑' + password.slice(2);
    assert.equal((await request('/auth/login', 'POST', undefined, { email, password: different })).status, 401);
  }
  const malformed = { email: 'malformed@example.test', password: '\ud800'.repeat(10) };
  assert.equal((await request('/auth/register', 'POST', undefined, { ...malformed, displayName: 'Password QA', agree: true })).status, 400);
  assert.equal((await request('/auth/login', 'POST', undefined, malformed)).status, 400);
});
test('concurrent repeated votes remain unique; changing and removing preserve counters', async () => {
  const id = await post(await user()); const voter = await user();
  const responses = await Promise.all(Array.from({ length: 8 }, () => vote(id, voter, 1)));
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM votes WHERE post_id=$1', [id])).rows[0].n, 1);
  assert.deepEqual(await counters(id), { up: 1, down: 0 });
  assert.equal((await vote(id, voter, -1)).status, 200);
  assert.deepEqual(await counters(id), { up: 0, down: 1 });
  await vote(id, voter, 0); await vote(id, voter, 0);
  assert.deepEqual(await counters(id), { up: 0, down: 0 });
  await vote(id, voter, -1); await vote(id, voter, 1);
  assert.deepEqual(await counters(id), { up: 1, down: 0 });
});
test('self-voting is forbidden and leaves no vote', async () => {
  const author = await user(); const id = await post(author);
  for (const value of [1, -1, 0]) assert.equal((await vote(id, author, value)).status, 403);
  assert.deepEqual(await counters(id), { up: 0, down: 0 });
});
test('keyset pagination preserves equal timestamps and microseconds without duplicates', async () => {
  const author = await user();
  for (let i = 0; i < 31; i++) {
    const id = await post(author, `Pagination ${i}`);
    await pool.query("UPDATE posts SET created_at='2026-01-01T00:00:00Z'::timestamptz + $1 * interval '1 microsecond' WHERE id=$2", [i % 7, id]);
  }
  const expected = (await pool.query('SELECT id FROM posts ORDER BY created_at DESC,id DESC')).rows.map((r) => r.id);
  const seen: string[] = []; let cursor: string | null = null;
  do {
    const r = await request(`/feed/latest?limit=4${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(r.status, 200); seen.push(...r.body.items.map((p: any) => p.id)); cursor = r.body.nextCursor;
    assert.ok(seen.length <= 31, 'pagination must terminate');
  } while (cursor);
  assert.deepEqual(seen, expected); assert.equal(new Set(seen).size, 31);
});
test('member gates reject anonymous, unverified, suspended and profileless accounts; Origin remains enforced', async () => {
  const id = await post(await user()); const unverified = await user(false); const suspended = await user(); const profileless = await user();
  await pool.query("UPDATE users SET status='suspended' WHERE id=$1", [suspended.id]);
  await pool.query('DELETE FROM profiles WHERE user_id=$1', [profileless.id]);
  for (const [u, status] of [[undefined, 401], [unverified, 403], [suspended, 403], [profileless, 403]] as const) {
    assert.equal((await request('/posts', 'POST', u, { body: 'Gate test' })).status, status);
    assert.equal((await vote(id, u as User, 1)).status, status);
    assert.equal((await request(`/posts/${id}/comments`, 'POST', u, { body: 'Gate test' })).status, status);
    assert.equal((await request('/media/upload-url', 'POST', u, { contentType: 'image/jpeg' })).status, status);
  }
  assert.equal((await request('/posts', 'POST', await user(), { body: 'Forged origin' }, 'https://evil.example')).status, 403);
  assert.equal((await request('/admin/reports')).status, 401);
  assert.equal((await request('/admin/reports', 'GET', await user())).status, 403);
});
test('only author edits/deletes; moderation can remove but cannot rewrite another author', async () => {
  const author = await user(); const other = await user(); const moderator = await user(true, 'moderator'); const id = await post(author);
  assert.equal((await request(`/posts/${id}`, 'PATCH', other, { body: 'Hijack' })).status, 404);
  assert.equal((await request(`/posts/${id}`, 'DELETE', other)).status, 403);
  assert.equal((await request(`/posts/${id}`, 'PATCH', moderator, { body: 'Hijack' })).status, 404);
  assert.equal((await request(`/posts/${id}`, 'PATCH', author, { body: 'Edited' })).status, 200);
  assert.equal((await request('/me/wall', 'GET', author)).body.items[0].body, 'Edited');
  assert.equal((await request(`/posts/${id}`, 'DELETE', author)).status, 200);
  assert.equal((await request('/me/wall', 'GET', author)).body.items.length, 0);
});
test('Featured eligibility and fairness use real trusted votes; Rising excludes Featured', async () => {
  const a = await user(); const b = await user(); const c = await user();
  const ids = [await post(a), await post(a), await post(b), await post(c), await post(await user()), await post(await user())];
  await pool.query("UPDATE posts SET sensitive=true WHERE id=$1", [ids[4]]);
  await pool.query("INSERT INTO reports(reporter_id,target_type,target_id,reason) VALUES($1,'post',$2,'Test report')", [b.id, ids[5]]);
  const voters = [await user(), await user(), await user()];
  for (const id of ids) for (const voter of voters) assert.equal((await vote(id, voter, 1)).status, 200);
  const featured = await computeFeatured();
  assert.equal(featured.length, 2); // all Art: maximum two per craft
  assert.ok(!featured.includes(ids[4]) && !featured.includes(ids[5]));
  const authors = (await pool.query('SELECT author_id FROM posts WHERE id=ANY($1::uuid[])', [featured])).rows.map((r) => r.author_id);
  assert.equal(authors.length, new Set(authors).size);
  const rising = await computeRising(featured);
  assert.ok(rising.length > 0 && rising.every((id) => !featured.includes(id) && id !== ids[4] && id !== ids[5]));
});
test('new report or distress edit disappears from saved rankings immediately', async () => {
  const author = await user(); const reporter = await user(); const id = await post(author);
  await pool.query("INSERT INTO ranking_snapshots(kind,items) VALUES('featured',$1::jsonb)", [JSON.stringify([id])]);
  assert.equal((await request('/feed/featured')).body.items.length, 1);
  await request('/reports', 'POST', reporter, { targetType: 'post', targetId: id, reason: 'Needs review' });
  assert.equal((await request('/feed/featured')).body.items.length, 0);
  await pool.query("UPDATE reports SET status='resolved'");
  await request(`/posts/${id}`, 'PATCH', author, { body: 'I want to hurt myself' });
  assert.equal((await request('/feed/featured')).body.items.length, 0);
});
test('weekly archives recover a missed Sunday, persist across worker restarts and freeze past weeks', async () => {
  const id = await post(await user());
  await pool.query(`INSERT INTO ranking_snapshots(kind,computed_at,items)
    VALUES('featured', (date_trunc('week',now() AT TIME ZONE 'UTC') - interval '3 days') AT TIME ZONE 'UTC', $1::jsonb)`, [JSON.stringify([id])]);
  const previousWeek = (await pool.query(`SELECT (date_trunc('week',now() AT TIME ZONE 'UTC')::date - 7)::text AS week`)).rows[0].week;
  const restart = () => promisify(execFile)(process.execPath, ['--require', 'tsx/cjs', '-e',
    "require('./src/ranking/worker').runOnce(true).then(()=>require('./src/db').pool.end()).catch(e=>{console.error(e);process.exit(1)})"],
    { env: process.env, timeout: 15000 });
  await restart();
  assert.deepEqual((await pool.query('SELECT items FROM featured_archive WHERE week_start=$1', [previousWeek])).rows[0]?.items, [id]);
  assert.deepEqual((await pool.query(`SELECT items FROM featured_archive WHERE week_start=date_trunc('week',now() AT TIME ZONE 'UTC')::date`)).rows[0]?.items, []);
  // A later ranking and fresh process must not replace a completed week's record.
  await pool.query("UPDATE ranking_snapshots SET computed_at=now()-interval '8 days', items='[]' WHERE kind='featured'");
  await restart();
  assert.deepEqual((await pool.query('SELECT items FROM featured_archive WHERE week_start=$1', [previousWeek])).rows[0]?.items, [id]);
});
test('Featured ranking and weekly archive updates roll back together on storage failure', async () => {
  const id = await post(await user());
  await pool.query("INSERT INTO ranking_snapshots(kind,items) VALUES('featured',$1::jsonb)", [JSON.stringify([id])]);
  await pool.query(`CREATE FUNCTION reject_archive() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'archive test failure'; END $$;
    CREATE TRIGGER reject_archive BEFORE INSERT OR UPDATE ON featured_archive FOR EACH ROW EXECUTE FUNCTION reject_archive()`);
  try {
    await assert.rejects(computeFeatured(), /archive test failure/);
    assert.deepEqual((await pool.query("SELECT items FROM ranking_snapshots WHERE kind='featured'")).rows[0].items, [id]);
  } finally {
    await pool.query('DROP TRIGGER reject_archive ON featured_archive; DROP FUNCTION reject_archive()');
  }
});
test('moderator promotion, demotion and suspension take effect with the existing session', async () => {
  const member = await user();
  await pool.query("UPDATE users SET role='moderator' WHERE id=$1", [member.id]);
  assert.equal((await request('/admin/reports', 'GET', member)).status, 200);
  const moderator = await user(true, 'moderator');
  await pool.query("UPDATE users SET role='member' WHERE id=$1", [moderator.id]);
  assert.equal((await request('/admin/reports', 'GET', moderator)).status, 403);
  await pool.query("UPDATE users SET role='moderator',status='suspended' WHERE id=$1", [moderator.id]);
  assert.equal((await request('/admin/reports', 'GET', moderator)).status, 403);
});
test('distress notice is retained and hidden post comments are not publicly exposed', async () => {
  const author = await user();
  const r = await request('/posts', 'POST', author, { body: 'I do not want to hurt myself' });
  assert.equal(r.status, 201); assert.equal(r.body.supportNotice, true);
  await request(`/posts/${r.body.id}/comments`, 'POST', author, { body: 'Private after hiding' });
  await pool.query("UPDATE posts SET status='hidden' WHERE id=$1", [r.body.id]);
  assert.equal((await request(`/posts/${r.body.id}/comments`)).status, 404);
});

test('local S3 upload, CORS, ownership, type and size checks', {
  skip: !/^http:\/\/(localhost|127\.0\.0\.1):9000$/.test(process.env.S3_ENDPOINT ?? ''),
}, async () => {
  const author = await user(); const other = await user();
  assert.equal((await request('/media/upload-url', 'POST', author, { contentType: 'image/svg+xml' })).status, 400);
  const signed = await request('/media/upload-url', 'POST', author, { contentType: 'image/png' });
  assert.equal(signed.status, 200);
  const cors = await fetch(signed.body.url, { method: 'OPTIONS', headers: {
    origin: 'http://localhost:3001', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type',
  } });
  assert.ok(['http://localhost:3001', '*'].includes(cors.headers.get('access-control-allow-origin') ?? ''));
  assert.ok(cors.headers.get('access-control-allow-methods')?.includes('PUT'));
  const fixture = readFileSync('../scripts/fixtures/upload-test.png');
  assert.ok((await fetch(signed.body.url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: fixture })).ok);
  const saved = await request('/posts', 'POST', author, { body: 'Test picture', mediaKey: signed.body.key });
  assert.equal(saved.status, 201);
  const feed = await request('/feed/latest');
  const publicPicture = feed.body.items.find((p: any) => p.id === saved.body.id).mediaUrl;
  const image = await fetch(publicPicture);
  assert.ok(image.ok);
  assert.match(publicPicture, /\/pictures\/[0-9a-f-]+\/[0-9a-f-]+\.jpg$/);
  const publishedBytes = Buffer.from(await image.arrayBuffer());
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual([...publishedBytes.subarray(0, 3)], [255, 216, 255]);
  // The still-valid upload link may replace staging bytes, but never the attached picture.
  assert.ok((await fetch(signed.body.url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: Buffer.from('not an image') })).ok);
  assert.deepEqual(Buffer.from(await (await fetch(publicPicture)).arrayBuffer()), publishedBytes);
  assert.equal((await request('/posts', 'POST', author, { body: 'Replaced staging bytes', mediaKey: signed.body.key })).status, 400);
  assert.equal((await request('/posts', 'POST', other, { body: 'Stolen picture', mediaKey: signed.body.key })).status, 400);
  const oversized = await request('/media/upload-url', 'POST', author, { contentType: 'image/png' });
  assert.ok((await fetch(oversized.body.url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: Buffer.alloc(2_000_001) })).ok);
  assert.equal((await request('/posts', 'POST', author, { body: 'Oversized picture', mediaKey: oversized.body.key })).status, 400);
});
test('local S3 rejects forged, corrupt, mismatched and excessive-pixel picture contents', {
  skip: !/^http:\/\/(localhost|127\.0\.0\.1):9000$/.test(process.env.S3_ENDPOINT ?? ''),
}, async () => {
  const sharp = (await import('sharp')).default;
  const author = await user();
  const png = readFileSync('../scripts/fixtures/upload-test.png');
  const cases = [
    { contentType: 'image/jpeg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>') },
    { contentType: 'image/png', bytes: png.subarray(0, 50) },
    { contentType: 'image/jpeg', bytes: png },
    { contentType: 'image/png', bytes: await sharp({ create: { width: 5000, height: 5000, channels: 3, background: 'white' } }).png().toBuffer() },
  ];
  for (const c of cases) {
    const signed = await request('/media/upload-url', 'POST', author, { contentType: c.contentType });
    assert.ok((await fetch(signed.body.url, { method: 'PUT', headers: { 'content-type': c.contentType }, body: c.bytes })).ok);
    assert.equal((await request('/posts', 'POST', author, { body: 'Invalid picture test', mediaKey: signed.body.key })).status, 400);
  }
  assert.equal((await request('/feed/latest')).body.items.length, 0);
});
test('local S3 fully decodes JPEG, PNG and WebP, rotates and strips embedded metadata', {
  skip: !/^http:\/\/(localhost|127\.0\.0\.1):9000$/.test(process.env.S3_ENDPOINT ?? ''),
}, async () => {
  const sharp = (await import('sharp')).default;
  const author = await user();
  const png = readFileSync('../scripts/fixtures/upload-test.png');
  for (const [format, contentType] of [['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']] as const) {
    const bytes = await sharp(png).withMetadata({ orientation: 6 }).toFormat(format).toBuffer();
    const signed = await request('/media/upload-url', 'POST', author, { contentType });
    assert.ok((await fetch(signed.body.url, { method: 'PUT', headers: { 'content-type': contentType }, body: bytes })).ok);
    const saved = await request('/posts', 'POST', author, { body: 'Valid picture test', mediaKey: signed.body.key });
    assert.equal(saved.status, 201);
    const feed = await request('/feed/latest');
    const picture = feed.body.items.find((p: any) => p.id === saved.body.id).mediaUrl;
    const output = Buffer.from(await (await fetch(picture)).arrayBuffer());
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'jpeg');
    assert.equal(metadata.width, 480); assert.equal(metadata.height, 640);
    assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
    assert.equal(metadata.orientation, undefined);
    assert.ok((await sharp(output).raw().toBuffer()).length > 0);
  }
});
test('legacy audit is read-only; preparation writes quarantine and a manifest without changing posts or passwords', {
  skip: !/^http:\/\/(localhost|127\.0\.0\.1):9000$/.test(process.env.S3_ENDPOINT ?? ''),
}, async () => {
  const author = await user(); const id = await post(author);
  const signed = await request('/media/upload-url', 'POST', author, { contentType: 'image/png' });
  assert.ok((await fetch(signed.body.url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: readFileSync('../scripts/fixtures/upload-test.png') })).ok);
  const originalUrl = `${process.env.S3_PUBLIC_BASE}/${signed.body.key}`;
  await pool.query('UPDATE posts SET media_url=$1 WHERE id=$2', [originalUrl, id]);
  const original = (await pool.query('SELECT media_url,status FROM posts WHERE id=$1', [id])).rows[0];
  const hash = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [author.id])).rows[0].password_hash;
  const run = (...args: string[]) => promisify(execFile)(process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/legacy-media.ts', ...args],
    { env: { ...process.env, NODE_ENV: 'production' }, timeout: 15000 });
  const audit = JSON.parse((await run()).stdout);
  assert.equal(audit.mode, 'read-only'); assert.equal(audit.legacyPictures, 1);
  assert.equal(audit.passwords.originalByteLengthUnknown, 1);
  assert.equal(audit.postsUpdated, 0); assert.equal(audit.passwordsChanged, 0);
  const output = join(tmpdir(), `htafl-legacy-${randomBytes(12).toString('hex')}.local.json`);
  try {
    const prepared = JSON.parse((await run('--prepare', '--output', output)).stdout);
    assert.equal(prepared.prepared, 1); assert.equal(prepared.scanningActivated, false);
    const manifest = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(manifest.entries[0].state, 'awaiting-scan');
    assert.ok(manifest.entries[0].quarantineKey.startsWith(`quarantine/legacy/${id}/`));
    assert.match(manifest.entries[0].sha256, /^[0-9a-f]{64}$/);
    assert.ok(!(await readFile(output, 'utf8')).includes(hash));
    await assert.rejects(run('--prepare', '--output', output), /EEXIST/);
    assert.deepEqual((await pool.query('SELECT media_url,status FROM posts WHERE id=$1', [id])).rows[0], original);
    assert.equal((await pool.query('SELECT password_hash FROM users WHERE id=$1', [author.id])).rows[0].password_hash, hash);
  } finally { await unlink(output).catch(() => {}); }
});
