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
test('network failures reject instead of pretending a save succeeded', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(api('/posts', { method: 'POST' }), /Failed to fetch/);
});
