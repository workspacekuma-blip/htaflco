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
  await pool.query('TRUNCATE users, ranking_snapshots, featured_archive, weekly_prompts, reply_email_budget CASCADE');
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
  const text = await response.text();
  return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) as any : { error: text } };
}
async function vote(id: string, u: User, value: number) { return request(`/posts/${id}/vote`, 'PUT', u, { value }); }
async function counters(id: string) {
  return (await pool.query('SELECT up,down FROM posts WHERE id=$1', [id])).rows[0];
}

test('health connects to real PostgreSQL', async () => {
  assert.deepEqual(await request('/health'), { status: 200, body: { ok: true } });
});

test('post headings, response labels and long text survive create, read and author edits', async () => {
  const author = await user();
  const body = 'My first line.\n\n' + 'A longer chapter. '.repeat(450) + 'Still going.';
  const created = await request('/posts', 'POST', author, { title: 'A new beginning', body, responseLabel: 'Constructive feedback' });
  assert.equal(created.status, 201);
  const detail = await request(`/posts/${created.body.id}`, 'GET', author);
  assert.equal(detail.body.title, 'A new beginning');
  assert.equal(detail.body.body, body);
  assert.equal(detail.body.responseLabel, 'Constructive feedback');
  assert.equal((await request(`/posts/${created.body.id}`, 'PATCH', await user(), { title: 'Someone else', body: 'Changed' })).status, 404);
  assert.equal((await request(`/posts/${created.body.id}`, 'PATCH', author, { title: 'Still creating', body: 'Updated words', responseLabel: 'Encouragement' })).status, 200);
  const updated = (await request(`/posts/${created.body.id}`)).body;
  assert.equal(updated.title, 'Still creating');
  assert.equal(updated.body, 'Updated words');
  assert.equal(updated.responseLabel, 'Encouragement');
  // Old clients can edit the body without erasing the heading or label.
  await request(`/posts/${created.body.id}`, 'PATCH', author, { body: 'Body only' });
  const retained = (await request('/feed/latest')).body.items[0];
  assert.equal(retained.title, 'Still creating');
  assert.equal(retained.responseLabel, 'Encouragement');
});

test('post limits and response labels are validated and headings receive the distress check', async () => {
  const author = await user();
  for (const fields of [{ title: ' ' }, { title: 'x'.repeat(101) }, { body: 'x'.repeat(10001) }, { responseLabel: 'Anything' }]) {
    assert.equal((await request('/posts', 'POST', author, { body: 'Words', ...fields })).status, 400);
  }
  const sensitive = await request('/posts', 'POST', author, { title: "I don't want to live", body: 'I am still making something' });
  assert.equal(sensitive.status, 201);
  assert.equal(sensitive.body.supportNotice, true);
  const legacy = await request('/posts', 'POST', author, { body: 'No heading supplied' });
  assert.equal(legacy.status, 201);
  const detail = (await request(`/posts/${legacy.body.id}`)).body;
  assert.equal(detail.title, null);
  assert.equal(detail.responseLabel, 'Just sharing');
  assert.equal((await request('/posts', 'POST', author, { body: 'x'.repeat(10000) })).status, 201);
  assert.equal((await request('/posts', 'POST', author, { body: '界'.repeat(10000) })).status, 201);
  assert.equal((await request(`/posts/${legacy.body.id}`, 'PATCH', author, { body: 'x'.repeat(10001) })).status, 400);
  const large = await fetch(base + '/posts', { method: 'POST', headers: { origin: 'http://localhost:3001', 'content-type': 'application/json', cookie: author.cookie }, body: JSON.stringify({ body: 'x'.repeat(70000) }) });
  assert.equal(large.status, 413); assert.match((await large.json() as { error: string }).error, /too large/);
  const malformed = await fetch(base + '/posts', { method: 'POST', headers: { origin: 'http://localhost:3001', 'content-type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
});

test('reply notifications are private, durable and only created for another member replying', async () => {
  const author = await user(); const other = await user(); const stranger = await user();
  const id = await post(author);
  assert.equal((await request('/me/notifications', 'GET', author)).status, 200);
  assert.equal((await request(`/posts/${id}/comments`, 'POST', other, { body: 'A thoughtful reply' })).status, 201);
  await request(`/posts/${id}/comments`, 'POST', author, { body: 'My own follow-up' });
  const inbox = await request('/me/notifications', 'GET', author);
  assert.equal(inbox.body.items.length, 1);
  assert.equal(inbox.body.unreadCount, 1);
  assert.equal(inbox.body.items[0].postId, id);
  assert.equal(inbox.body.items[0].body, 'A thoughtful reply');
  assert.equal(inbox.body.items[0].readAt, null);
  assert.equal((await request('/me/notifications', 'GET', other)).body.items.length, 0);
  assert.equal((await request('/me/notifications')).status, 401);
  const notification = inbox.body.items[0].id;
  assert.equal((await request(`/me/notifications/${notification}/read`, 'POST', stranger)).status, 404);
  assert.equal((await request(`/me/notifications/${notification}/read`, 'POST', author)).status, 200);
  assert.equal((await request('/me/notifications', 'GET', author)).body.unreadCount, 0);
  assert.equal((await request(`/me/notifications/${notification}/read`, 'POST', author, undefined, 'https://forged.example')).status, 403);
  await pool.query("UPDATE users SET status='suspended' WHERE id=$1", [author.id]);
  assert.equal((await request('/me/notifications', 'GET', author)).status, 403);
});

test('hidden replies and posts vanish from notifications and their unread counts', async () => {
  const author = await user(); const other = await user(); const id = await post(author);
  assert.equal((await request('/me/notifications', 'GET', author)).status, 200);
  const reply = await request(`/posts/${id}/comments`, 'POST', other, { body: 'Reply' });
  await pool.query("UPDATE comments SET status='hidden' WHERE id=$1", [reply.body.id]);
  assert.deepEqual((await request('/me/notifications', 'GET', author)).body.items, []);
  assert.equal((await request('/me/notifications', 'GET', author)).body.unreadCount, 0);
  await pool.query("UPDATE comments SET status='published' WHERE id=$1", [reply.body.id]);
  await pool.query("UPDATE posts SET status='hidden' WHERE id=$1", [id]);
  assert.equal((await request('/me/notifications', 'GET', author)).body.items.length, 0);
  await pool.query('DELETE FROM posts WHERE id=$1', [id]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM reply_notifications')).rows[0].n, 0);
});

test('reply email defaults off, records opt-in and cancels pending delivery on opt-out', async () => {
  const author = await user(); const other = await user(); const id = await post(author);
  const preferences = await request('/me/notification-preferences', 'GET', author);
  assert.equal(preferences.status, 200);
  assert.equal(preferences.body.replyEmail, false);
  await request(`/posts/${id}/comments`, 'POST', other, { body: 'In-app only' });
  assert.equal((await pool.query('SELECT email_status FROM reply_notifications')).rows[0].email_status, 'none');
  assert.equal((await request('/me/notification-preferences', 'PATCH', author, { replyEmail: true })).status, 200);
  assert.ok((await pool.query('SELECT reply_email_consented_at FROM users WHERE id=$1', [author.id])).rows[0].reply_email_consented_at);
  await request(`/posts/${id}/comments`, 'POST', other, { body: 'Email opted in' });
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM reply_notifications WHERE email_status='pending'")).rows[0].n, 1);
  assert.equal((await request('/me/notification-preferences', 'PATCH', author, { replyEmail: false })).status, 200);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM reply_notifications WHERE email_status='pending'")).rows[0].n, 0);
  assert.equal((await request('/me/notification-preferences', 'PATCH', author, { replyEmail: 'yes' })).status, 400);
  assert.equal((await request('/me/notification-preferences', 'PATCH', await user(false), { replyEmail: true })).status, 403);
});

test('reply unsubscribe links cannot create sessions and only change email preferences after a POST', async () => {
  const author = await user();
  await request('/me/notification-preferences', 'PATCH', author, { replyEmail: true });
  const { replyUnsubscribeToken } = require('../src/reply-emails') as typeof import('../src/reply-emails');
  const token = replyUnsubscribeToken(author.id);
  assert.equal((await request('/auth/me', 'GET', { id: author.id, cookie: `htafl_session=${token}` })).status, 401);
  await request('/notifications/email-unsubscribe?token=' + token);
  assert.equal((await request('/me/notification-preferences', 'GET', author)).body.replyEmail, true);
  assert.equal((await request('/notifications/email-unsubscribe', 'POST', undefined, { token: token + 'x' })).status, 400);
  assert.equal((await request('/notifications/email-unsubscribe', 'POST', undefined, { token })).status, 200);
  assert.equal((await request('/me/notification-preferences', 'GET', author)).body.replyEmail, false);
});

test('SMTP outbox sends only opted-in replies, omits personal text and enforces its daily free-tier budget', async () => {
  const author = await user(); const other = await user(); const id = await post(author, 'SECRET_STORY');
  await pool.query("UPDATE posts SET title='SECRET_HEADING' WHERE id=$1", [id]);
  await request('/me/notification-preferences', 'PATCH', author, { replyEmail: true });
  await request(`/posts/${id}/comments`, 'POST', other, { body: 'SECRET_REPLY' });
  await request(`/posts/${id}/comments`, 'POST', other, { body: 'Another reply' });
  const script = `
    const assert=require('node:assert/strict'); const net=require('node:net'); let messages=[];
    const smtp=net.createServer(socket=>{let input='',data=false;socket.write('220 localhost SMTP\\r\\n');socket.on('data',chunk=>{
      input+=chunk.toString(); while(input.includes('\\r\\n')) {
        if(data){const end=input.indexOf('\\r\\n.\\r\\n'); if(end<0)return;messages.push(input.slice(0,end));input=input.slice(end+5);data=false;socket.write('250 accepted\\r\\n');continue;}
        const end=input.indexOf('\\r\\n');const line=input.slice(0,end);input=input.slice(end+2);
        if(line.startsWith('EHLO')||line.startsWith('HELO'))socket.write('250 localhost\\r\\n');
        else if(line==='DATA'){data=true;socket.write('354 send data\\r\\n');}
        else if(line==='QUIT'){socket.end('221 bye\\r\\n');}
        else socket.write('250 OK\\r\\n');
      }
    });});
    (async()=>{
      await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));process.env.SMTP_URL='smtp://127.0.0.1:'+smtp.address().port;process.env.REPLY_EMAIL_DAILY_LIMIT='1';
      const {processReplyEmails}=require('./src/reply-emails');const {pool}=require('./src/db');
      try {await Promise.all([processReplyEmails(),processReplyEmails()]);assert.equal(messages.length,1);assert.ok(messages[0].includes('/posts/'));
        assert.ok(!messages[0].includes('SECRET_STORY')&&!messages[0].includes('SECRET_HEADING')&&!messages[0].includes('SECRET_REPLY'));
        assert.ok(messages[0].includes('/notifications/unsubscribe?'));console.log('SMTP delivery and budget verified');
      } finally {await pool.end();await new Promise(resolve=>smtp.close(resolve));}
    })().catch(e=>{console.error(e);process.exitCode=1});
  `;
  const result = await promisify(execFile)(process.execPath, ['--require', 'tsx/cjs', '-e', script], { env: { ...process.env }, timeout: 25000 });
  assert.match(result.stdout, /SMTP delivery and budget verified/);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM reply_notifications WHERE email_status='sent'")).rows[0].n, 1);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM reply_notifications WHERE email_status='pending'")).rows[0].n, 1);
});

test('SMTP failures remain retryable and an exhausted restart claim becomes failed', async () => {
  const author = await user(); const other = await user(); const id = await post(author);
  await request('/me/notification-preferences', 'PATCH', author, { replyEmail: true });
  await request(`/posts/${id}/comments`, 'POST', other, { body: 'Reply needing recovery' });
  const result = await promisify(execFile)(process.execPath, ['--require', 'tsx/cjs', '-e', `
    const net=require('node:net');(async()=>{const smtp=net.createServer(s=>s.end('421 Temporary failure\\r\\n'));
    await new Promise(r=>smtp.listen(0,'127.0.0.1',r));process.env.SMTP_URL='smtp://127.0.0.1:'+smtp.address().port;
    const {processReplyEmails}=require('./src/reply-emails');const {pool}=require('./src/db');
    try{await processReplyEmails()}finally{await pool.end();await new Promise(r=>smtp.close(r))}})().catch(e=>{console.error(e);process.exit(1)});
  `], { env: { ...process.env }, timeout: 15000 });
  assert.match(result.stderr, /Reply email delivery failed/);
  const pending = (await pool.query('SELECT email_status,email_attempts,email_next_at>now() AS deferred FROM reply_notifications')).rows[0];
  assert.deepEqual(pending, { email_status: 'pending', email_attempts: 1, deferred: true });
  await pool.query("UPDATE reply_notifications SET email_status='sending',email_attempts=5,email_attempted_at=now()-interval '20 minutes'");
  await promisify(execFile)(process.execPath, ['--require', 'tsx/cjs', '-e', `
    process.env.SMTP_URL='smtp://127.0.0.1:1'; const {processReplyEmails}=require('./src/reply-emails');const {pool}=require('./src/db');
    processReplyEmails().finally(()=>pool.end()).catch(e=>{console.error(e);process.exitCode=1});
  `], { env: { ...process.env }, timeout: 15000 });
  assert.equal((await pool.query('SELECT email_status FROM reply_notifications')).rows[0].email_status, 'failed');
});

test('notifications use stable keyset pagination without duplicates', async () => {
  const author = await user(); const other = await user(); const id = await post(author);
  assert.equal((await request('/me/notifications', 'GET', author)).status, 200);
  for (let i = 0; i < 7; i++) await request(`/posts/${id}/comments`, 'POST', other, { body: `Reply ${i}` });
  const seen: string[] = []; let cursor: string | null = null;
  do {
    const page = await request('/me/notifications?limit=2' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''), 'GET', author);
    seen.push(...page.body.items.map((n: { id: string }) => n.id));
    cursor = page.body.nextCursor;
  } while (cursor);
  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7);
});

test('only moderators schedule UTC Monday prompts and posts can join only the current week', async () => {
  const mod = await user(true, 'moderator'); const member = await user();
  assert.equal((await request('/prompts/current')).status, 200);
  const dates = (await pool.query("SELECT date_trunc('week',now() AT TIME ZONE 'UTC')::date::text AS current, (date_trunc('week',now() AT TIME ZONE 'UTC')::date+7)::text AS future, (date_trunc('week',now() AT TIME ZONE 'UTC')::date-7)::text AS past")).rows[0];
  const prompt = { weekStart: dates.current, title: 'Starting again', body: 'Make something that represents a new beginning.' };
  assert.equal((await request('/admin/prompts', 'POST', member, prompt)).status, 403);
  assert.equal((await request('/admin/prompts', 'POST', undefined, prompt)).status, 401);
  assert.equal((await request('/admin/prompts', 'POST', mod, { ...prompt, weekStart: dates.past })).status, 400);
  assert.equal((await request('/admin/prompts', 'POST', mod, { ...prompt, weekStart: '2026-10-08' })).status, 400);
  const current = await request('/admin/prompts', 'POST', mod, prompt);
  assert.equal(current.status, 201);
  const future = await request('/admin/prompts', 'POST', mod, { ...prompt, weekStart: dates.future, title: 'Next week' });
  assert.equal(future.status, 201);
  assert.equal((await request('/prompts/current')).body.prompt.id, current.body.id);
  const joined = await request('/posts', 'POST', member, { title: 'My first step', body: 'A response to this week', promptId: current.body.id });
  assert.equal(joined.status, 201);
  const detail = (await request(`/posts/${joined.body.id}`)).body;
  assert.equal(detail.promptId, current.body.id);
  assert.equal(detail.promptTitle, 'Starting again');
  assert.equal((await request('/posts', 'POST', member, { body: 'Too early', promptId: future.body.id })).status, 400);
  assert.equal((await request('/posts', 'POST', member, { body: 'Unknown', promptId: '00000000-0000-4000-8000-000000000001' })).status, 400);
  assert.equal((await request('/feed/browse?challenge=' + current.body.id)).body.items.length, 1);
});

test('prompt rollover and empty weeks depend on database time, with no running scheduler', async () => {
  const mod = await user(true, 'admin');
  assert.equal((await request('/prompts/current')).status, 200);
  assert.equal((await request('/prompts/current')).body.prompt, null);
  const week = (await pool.query("SELECT date_trunc('week',now() AT TIME ZONE 'UTC')::date::text AS d")).rows[0].d;
  const r = await request('/admin/prompts', 'POST', mod, { weekStart: week, title: 'A small step', body: 'Make one thing.' });
  assert.equal(r.status, 201);
  await pool.query('UPDATE weekly_prompts SET week_start=week_start-7 WHERE id=$1', [r.body.id]);
  assert.equal((await request('/prompts/current')).body.prompt, null);
  await pool.query('UPDATE weekly_prompts SET week_start=week_start+7 WHERE id=$1', [r.body.id]);
  assert.equal((await request('/prompts/current')).body.prompt.id, r.body.id);
  const updated = await request('/admin/prompts', 'POST', mod, { weekStart: week, title: 'A revised small step', body: 'Make a little thing.' });
  assert.equal(updated.body.id, r.body.id);
  assert.equal((await request('/admin/prompts', 'GET', mod)).body.items.length, 1);
});
test('verification signs a signed-out member in and permits participation', async () => {
  const member = await user(false);
  const token = randomBytes(24).toString('hex');
  await pool.query('UPDATE users SET verify_token=$1 WHERE id=$2', [token, member.id]);
  const response = await fetch(`${base}/auth/verify?token=${token}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const session = response.headers.get('set-cookie');
  assert.ok(session, 'Verification must create a session for a signed-out visitor');
  assert.match(session, /HttpOnly/i);
  assert.match(session, /SameSite=Lax/i);
  const signedIn = { id: member.id, cookie: session.split(';')[0] };
  const me = await request('/auth/me', 'GET', signedIn);
  assert.equal(me.status, 200);
  assert.equal(me.body.id, member.id);
  assert.equal(me.body.emailVerified, true);
  assert.equal((await request('/posts', 'POST', signedIn, { body: 'Verification test post', pillar: 'Create', craft: 'Art' })).status, 201);
  assert.deepEqual((await pool.query('SELECT email_verified,verify_token FROM users WHERE id=$1', [member.id])).rows[0], { email_verified: true, verify_token: null });
  const replay = await fetch(`${base}/auth/verify?token=${token}`);
  assert.equal(replay.status, 400);
  assert.equal(replay.headers.get('set-cookie'), null);
});
test('verification replaces a different session and retains the verified account role', async () => {
  const admin = await user(false, 'admin');
  const other = await user();
  const token = randomBytes(24).toString('hex');
  await pool.query('UPDATE users SET verify_token=$1 WHERE id=$2', [token, admin.id]);
  const responses = await Promise.all(Array.from({ length: 2 }, () => fetch(`${base}/auth/verify?token=${token}`, { headers: { cookie: other.cookie } })));
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
  const response = responses.find((r) => r.status === 200)!;
  const session = response.headers.get('set-cookie');
  assert.ok(session);
  const signedIn = { id: admin.id, cookie: session.split(';')[0] };
  const me = await request('/auth/me', 'GET', signedIn);
  assert.equal(me.body.id, admin.id);
  assert.equal(me.body.role, 'admin');
  assert.equal((await request('/admin/reports', 'GET', signedIn)).status, 200);
  assert.equal(responses.find((r) => r.status === 400)!.headers.get('set-cookie'), null);
});
test('verification never signs in a suspended account or accepts invalid tokens', async () => {
  const member = await user(false);
  const token = randomBytes(24).toString('hex');
  await pool.query("UPDATE users SET verify_token=$1,status='suspended' WHERE id=$2", [token, member.id]);
  for (const path of [`/auth/verify?token=${token}`, '/auth/verify?token=not-a-real-verification-token', '/auth/verify?token=short', '/auth/verify']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal((await pool.query('SELECT email_verified FROM users WHERE id=$1', [member.id])).rows[0].email_verified, false);
});
test('production verification creates a Secure session cookie', async () => {
  const member = await user(false);
  const token = randomBytes(24).toString('hex');
  await pool.query('UPDATE users SET verify_token=$1 WHERE id=$2', [token, member.id]);
  const result = await promisify(execFile)(process.execPath, ['--require', 'tsx/cjs', '-e', `
    const assert=require('node:assert/strict'); const {app}=require('./src/server'); const {pool}=require('./src/db');
    (async()=>{
      const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
      try {
        const response=await fetch('http://127.0.0.1:'+server.address().port+'/auth/verify?token='+process.env.TEST_VERIFY_TOKEN);
        assert.equal(response.status,200);
        const cookie=response.headers.get('set-cookie');
        assert.match(cookie,/; Secure(?:;|$)/i); assert.match(cookie,/; HttpOnly(?:;|$)/i); assert.match(cookie,/SameSite=Lax/i);
        assert.equal(response.headers.get('cache-control'),'no-store');
      } finally {await new Promise(resolve=>server.close(resolve)); await pool.end()}
      console.log('production verification cookie verified');
    })().catch(e=>{console.error(e);process.exit(1)});
  `], { env: { ...process.env, NODE_ENV: 'production', TEST_VERIFY_TOKEN: token }, timeout: 15000 });
  assert.match(result.stdout, /production verification cookie verified/);
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
test('post details expose published content and viewer votes, never hidden or deleted posts', async () => {
  const author = await user(); const viewer = await user();
  const postId = await post(author, 'A complete post with\na second line.');
  await vote(postId, viewer, 1);
  const response = await fetch(`${base}/posts/${postId}`, { headers: { cookie: viewer.cookie } });
  assert.equal(response.status, 200);
  const detail = { body: await response.json() as any };
  assert.equal(detail.body.id, postId);
  assert.equal(detail.body.body, 'A complete post with\na second line.');
  assert.equal(detail.body.author, 'Test member');
  assert.equal(detail.body.myVote, 1);
  assert.equal(detail.body.up, 1);
  assert.equal(detail.body.score, 1);
  assert.equal(detail.body.commentCount, 0);
  assert.equal((await request(`/posts/${postId}`)).body.myVote, null);
  assert.equal('password_hash' in detail.body, false);
  assert.equal('email' in detail.body, false);
  await pool.query("UPDATE posts SET sensitive=true WHERE id=$1", [postId]);
  assert.equal((await request(`/posts/${postId}`)).status, 200);
  for (const status of ['hidden', 'removed']) {
    await pool.query('UPDATE posts SET status=$1 WHERE id=$2', [status, postId]);
    assert.equal((await request(`/posts/${postId}`, 'GET', author)).status, 404);
    assert.equal((await request(`/posts/${postId}`)).status, 404);
  }
  await pool.query('DELETE FROM posts WHERE id=$1', [postId]);
  assert.equal((await request(`/posts/${postId}`)).status, 404);
  assert.equal((await request('/posts/not-a-uuid')).status, 400);
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

test('private media waits for human review, serves ranges, and cannot be overwritten or reused', {
  skip: !/^http:\/\/(localhost|127\.0\.0\.1):9000$/.test(process.env.S3_ENDPOINT ?? ''),
}, async () => {
  const { config } = require('../src/config') as typeof import('../src/config');
  const old = config.mediaReviewMode; config.mediaReviewMode = 'manual';
  try {
    const author = await user(); const other = await user(); const moderator = await user(true, 'moderator');
    const signed = await request('/media/upload-url', 'POST', author, { contentType: 'image/png' });
    assert.equal(signed.status, 200);
    assert.ok((await fetch(signed.body.url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: readFileSync('../scripts/fixtures/upload-test.png') })).ok);
    assert.equal((await request('/posts', 'POST', other, { body: 'Stolen', mediaKey: signed.body.key })).status, 400);
    const created = await request('/posts', 'POST', author, { title: 'Private fixture', body: 'Awaiting a human look', mediaKey: signed.body.key, mediaAlt: 'Blue test square' });
    assert.equal(created.status, 201); assert.equal(created.body.pendingReview, true);
    const id = created.body.id;
    assert.equal((await request(`/posts/${id}`)).status, 404);
    assert.equal((await request('/feed/latest')).body.items.length, 0);
    const mine = (await request('/me/wall', 'GET', author)).body.items[0];
    assert.equal(mine.status, 'pending'); assert.equal(mine.mediaKind, 'picture');
    const mediaPath = new URL(mine.mediaUrl).pathname.replace(/^\/api/, '');
    assert.equal((await fetch(base + mediaPath)).status, 404);
    const privatePicture = await fetch(base + mediaPath, { headers: { cookie: author.cookie } });
    assert.equal(privatePicture.status, 200);
    const immutable = Buffer.from(await privatePicture.arrayBuffer());
    assert.equal((await request('/admin/media-pending', 'GET', other)).status, 403);
    assert.equal((await request('/admin/media-pending', 'GET', moderator)).body.items[0].id, id);
    assert.equal((await request(`/admin/posts/${id}/status`, 'POST', moderator, { status: 'published' })).status, 409);
    assert.equal((await request(`/admin/posts/${id}/approve-media`, 'POST', other)).status, 403);
    assert.equal((await request(`/admin/posts/${id}/approve-media`, 'POST', moderator)).status, 200);
    assert.equal((await request(`/posts/${id}`)).status, 200);
    assert.ok((await fetch(signed.body.url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: Buffer.from('replacement') })).ok);
    assert.deepEqual(Buffer.from(await (await fetch(base + mediaPath)).arrayBuffer()), immutable);
    assert.equal((await request('/posts', 'POST', author, { body: 'Reuse', mediaKey: signed.body.key })).status, 400);
    const range = await fetch(base + mediaPath, { headers: { range: 'bytes=0-2' } });
    assert.equal(range.status, 206); assert.deepEqual([...new Uint8Array(await range.arrayBuffer())], [255,216,255]);
    assert.equal((await fetch(base + mediaPath, { headers: { range: 'bytes=99999999-' } })).status, 416);
    await request(`/admin/posts/${id}/status`, 'POST', moderator, { status: 'hidden' });
    assert.equal((await fetch(base + mediaPath)).status, 404);
    // An old JWT role must not keep moderation access after demotion.
    await pool.query("UPDATE users SET role='member' WHERE id=$1", [moderator.id]);
    assert.equal((await fetch(base + mediaPath, { headers: { cookie: moderator.cookie } })).status, 404);
  } finally { config.mediaReviewMode = old; }
});

test('MP4 uploads recover interrupted processing, remain private until approval, and clean only expired staging', {
  skip: !/^http:\/\/(localhost|127\.0\.0\.1):9000$/.test(process.env.S3_ENDPOINT ?? ''),
}, async () => {
  const { config } = require('../src/config') as typeof import('../src/config');
  const old = config.mediaReviewMode; config.mediaReviewMode = 'manual';
  const path = join(tmpdir(), `htafl-test-${randomBytes(8).toString('hex')}.mp4`);
  try {
    const ffmpeg = require('ffmpeg-static') as string;
    await promisify(execFile)(ffmpeg, ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10','-f','lavfi','-i','sine=frequency=440','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',path]);
    const author = await user(); const moderator = await user(true, 'moderator');
    const signed = await request('/media/upload-url','POST',author,{ contentType:'video/mp4' });
    assert.equal(signed.status,200);
    assert.ok((await fetch(signed.body.url,{ method:'PUT',headers:{ 'content-type':'video/mp4' },body:await readFile(path) })).ok);
    // A crash after claiming an upload is recoverable after five minutes.
    await pool.query("UPDATE post_media SET state='processing',updated_at=now()-interval '6 minutes' WHERE source_key=$1",[signed.body.key]);
    const saved = await request('/posts','POST',author,{ title:'Dev video',body:'Only a local test',mediaKey:signed.body.key });
    assert.equal(saved.status,201); assert.equal(saved.body.pendingReview,true);
    const mine = (await request('/me/wall','GET',author)).body.items[0];
    assert.equal(mine.mediaKind,'video');
    const mediaPath = new URL(mine.mediaUrl).pathname.replace(/^\/api/,'');
    assert.equal((await fetch(base+mediaPath)).status,404);
    await request(`/admin/posts/${saved.body.id}/approve-media`,'POST',moderator);
    const media = await fetch(base+mediaPath);
    assert.equal(media.headers.get('content-type'),'video/mp4');
    const valid = Buffer.from(await media.arrayBuffer()); assert.equal(valid.toString('ascii',4,8),'ftyp');
    await pool.query("UPDATE post_media SET updated_at=now()-interval '2 days' WHERE source_key=$1",[signed.body.key]);
    const { cleanupUnattachedMedia } = require('../src/private-media') as typeof import('../src/private-media');
    await cleanupUnattachedMedia();
    assert.equal((await pool.query('SELECT source_cleaned FROM post_media WHERE source_key=$1',[signed.body.key])).rows[0].source_cleaned,true);
    assert.deepEqual(Buffer.from(await (await fetch(base+mediaPath)).arrayBuffer()),valid);
    await request(`/posts/${saved.body.id}`,'DELETE',author);
    await cleanupUnattachedMedia();
    assert.equal((await pool.query('SELECT 1 FROM post_media WHERE source_key=$1',[signed.body.key])).rowCount,0);
    assert.equal((await fetch(base+mediaPath)).status,404);
  } finally { config.mediaReviewMode=old; await unlink(path).catch(()=>{}); }
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
