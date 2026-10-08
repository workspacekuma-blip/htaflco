import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legacyPictureKey, passwordHashKind } from '../src/legacy';

const author = '12345678-1234-1234-1234-123456789abc';
const picture = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const base = 'https://media.example.test/bucket';
const key = `uploads/${author}/${picture}.png`;

test('legacy candidates require a literal same-storage author-owned upload URL', () => {
  assert.equal(legacyPictureKey(`${base}/${key}`, author, base), key);
  assert.equal(legacyPictureKey(`${base}/${key}`, author, base + '/'), key);
});
test('legacy planning rejects external, encoded, traversing and query URLs', () => {
  for (const url of [`https://other.example.test/${key}`, `${base}.evil.test/${key}`, `${base}/${key}?x=1`,
    `${base}/uploads/${author}/../${picture}.png`, `${base}/${key.replace('uploads', '%75ploads')}`]) {
    assert.equal(legacyPictureKey(url, author, base), null);
  }
  assert.equal(legacyPictureKey(`${base}/${key}`, picture, base), null);
  assert.equal(legacyPictureKey(`${base}/pictures/${author}/${picture}.jpg`, author, base), null);
});
test('password audit reports hash structure and cost, never inferred original length', () => {
  assert.equal(passwordHashKind('$2b$12$' + 'a'.repeat(53)), 'bcrypt');
  assert.equal(passwordHashKind('$2a$04$' + 'a'.repeat(53)), 'weak-bcrypt');
  for (const hash of ['plaintext', '$2a$12$short', '$2b$99$' + 'a'.repeat(53)]) {
    assert.equal(passwordHashKind(hash), 'unsupported');
  }
});
