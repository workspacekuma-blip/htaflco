import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decay,
  FeaturedCandidate,
  RisingCandidate,
  selectFeatured,
  selectRising,
  wilsonLowerBound,
} from '../src/ranking/score';

test('wilson: no votes score zero', () => {
  assert.equal(wilsonLowerBound(0, 0), 0);
});

test('wilson: volume matters, so 100 upvotes beats 10 upvotes', () => {
  const ten = wilsonLowerBound(10, 0);
  const hundred = wilsonLowerBound(100, 0);
  assert.ok(ten > 0.7 && ten < 0.75, `got ${ten}`);
  assert.ok(hundred > 0.95 && hundred < 0.97, `got ${hundred}`);
});

test('wilson: same share of upvotes scores higher with more votes', () => {
  assert.ok(wilsonLowerBound(80, 20) > wilsonLowerBound(8, 2));
});

test('decay: fresh votes count fully, old votes fade', () => {
  assert.equal(decay(0), 1);
  assert.ok(decay(12 * 3600_000) < 0.15);
});

const feat = (id: string, author: string, craft: string, up: number, down = 0, voters = 10): FeaturedCandidate => ({
  postId: id, authorId: author, craft, createdAt: 1000, up, down, voters,
});

test('featured: one post per author and at most two per craft', () => {
  const out = selectFeatured(
    [
      feat('a1', 'A', 'Art', 50),
      feat('a2', 'A', 'Art', 49),
      feat('b', 'B', 'Art', 48),
      feat('c', 'C', 'Art', 47),
      feat('d', 'D', 'Music', 20),
    ],
    { minVoters: 3 },
  );
  assert.deepEqual(out, ['a1', 'b', 'd']);
});

test('featured: needs enough voters and more up than down; caps at five', () => {
  const out = selectFeatured(
    [feat('few', 'A', 'Art', 30, 0, 2), feat('bad', 'B', 'Art', 5, 9), ...['1', '2', '3', '4', '5', '6'].map((n, i) => feat('p' + n, 'U' + n, 'Craft' + n, 40 - i))],
    { minVoters: 3 },
  );
  assert.equal(out.length, 5);
  assert.ok(!out.includes('few') && !out.includes('bad'));
});

const rise = (id: string, author: string, momentum: number, newcomer = false, recentVoters = 5): RisingCandidate => ({
  postId: id, authorId: author, createdAt: 1000, momentum, recentVoters, newcomer,
});

test('rising: reserves spots for newcomers even when veterans score higher', () => {
  const veterans = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'].map((id, i) => rise(id, 'V' + id, 100 - i));
  const out = selectRising([...veterans, rise('n1', 'N1', 2, true), rise('n2', 'N2', 1, true)], { minVoters: 3, size: 8, reserve: 2 });
  assert.equal(out.length, 8);
  assert.ok(out.includes('n1') && out.includes('n2'));
});

test('rising: ignores posts without recent voters and keeps one per author', () => {
  const out = selectRising(
    [rise('quiet', 'Q', 50, false, 1), rise('x1', 'X', 10), rise('x2', 'X', 9)],
    { minVoters: 3 },
  );
  assert.deepEqual(out, ['x1']);
});
