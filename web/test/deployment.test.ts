import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function hostedConfig(apiUrl?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, NETLIFY: 'true' };
  delete env.API_URL;
  if (apiUrl !== undefined) env.API_URL = apiUrl;
  return spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./next.config.mjs')"],
    { env, encoding: 'utf8' });
}

test('Netlify requires a hosted HTTPS API origin instead of the local fallback', () => {
  for (const value of [undefined, 'http://localhost:3000', 'https://localhost', 'https://127.0.0.1',
    'https://[::1]', 'https://user:password@example.test', 'https://example.test/path', 'https://example.test?token=x']) {
    assert.notEqual(hostedConfig(value).status, 0);
  }
  assert.equal(hostedConfig('https://api.example.test').status, 0);
});
