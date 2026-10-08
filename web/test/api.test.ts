import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { api, ApiError } from '../lib/api';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
test('API requests retain same-origin cookies and submitted JSON', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/posts');
    assert.equal(init?.credentials, 'same-origin');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.body, '{"body":"A test"}');
    return Response.json({ id: 'saved' }, { status: 201 });
  };
  assert.deepEqual(await api('/posts', { method: 'POST', body: '{"body":"A test"}' }), { id: 'saved' });
});
test('member gate errors retain the useful server message and status', async () => {
  globalThis.fetch = async () => Response.json({ error: 'Verify your email first' }, { status: 403 });
  await assert.rejects(api('/posts'), (e: unknown) => e instanceof ApiError && e.status === 403 && e.message === 'Verify your email first');
});
test('proxy failures without JSON produce a readable API error', async () => {
  globalThis.fetch = async () => new Response('Bad gateway', { status: 502 });
  await assert.rejects(api('/posts'), (e: unknown) => e instanceof ApiError && e.status === 502);
});
test('a proxy HTML response cannot be mistaken for loaded posts or a successful save', async () => {
  globalThis.fetch = async () => new Response('<html>Server starting</html>', { status: 200 });
  await assert.rejects(api('/feed/latest', {}, 'guest'), (e: unknown) => e instanceof ApiError && e.status === 502);
  await assert.rejects(api('/posts', { method: 'POST' }), (e: unknown) => e instanceof ApiError && e.status === 502);
});
test('network failures reject instead of pretending a save succeeded', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(api('/posts', { method: 'POST' }), /Failed to fetch/);
});
test('concurrent scoped post reads share one request while different viewers stay separate', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    const request = ++calls;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return Response.json({ items: [{ myVote: request === 1 ? 1 : -1 }] });
  };
  const [first, repeated] = await Promise.all([
    api('/feed/latest?limit=12', {}, 'member-a'),
    api('/feed/latest?limit=12', {}, 'member-a'),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(first, repeated);
  await Promise.all([api('/feed/latest?limit=12', {}, 'member-a'), api('/feed/latest?limit=12', {}, 'member-b')]);
  assert.equal(calls, 3, 'Finished responses are not cached, and viewers never share their vote state');
});
test('failed scoped reads are retryable and slow requests have a useful timeout error', async () => {
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.ok(init?.signal, 'Scoped reads must have a bounded wait');
    await new Promise((resolve) => setTimeout(resolve, 20));
    throw new DOMException('Timed out', 'TimeoutError');
  };
  const failures = await Promise.allSettled([api('/feed/rising', {}, 'guest'), api('/feed/rising', {}, 'guest')]);
  assert.equal(calls, 1);
  for (const failure of failures) {
    assert.equal(failure.status, 'rejected');
    if (failure.status === 'rejected') assert.match(failure.reason.message, /taking too long.*try again/i);
  }
  globalThis.fetch = async () => { calls++; return Response.json({ items: [] }); };
  assert.deepEqual(await api('/feed/rising', {}, 'guest'), { items: [] });
  assert.equal(calls, 2);
});
test('verification links and writes are never deduplicated as post reads', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ ok: true }); };
  await Promise.all([api('/auth/verify?token=test-only', {}, 'guest'), api('/auth/verify?token=test-only', {}, 'guest')]);
  await Promise.all([api('/posts', { method: 'POST' }, 'member-a'), api('/posts', { method: 'POST' }, 'member-a')]);
  assert.equal(calls, 4);
});
test('the initial account check has a timeout so it cannot hold post loading forever', async () => {
  globalThis.fetch = async (_url, init) => {
    assert.ok(init?.signal, 'The account check also needs a bounded wait');
    return Response.json({ id: 'member-a' });
  };
  assert.deepEqual(await api('/auth/me'), { id: 'member-a' });
});
