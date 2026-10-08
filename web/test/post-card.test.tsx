import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import PostCard from '../components/PostCard';
import { AuthProvider } from '../lib/auth';
import type { Post } from '../lib/types';

const { renderToStaticMarkup } = require('react-dom/server') as { renderToStaticMarkup: (node: React.ReactNode) => string };
const post = {
  id: '00000000-0000-4000-8000-000000000001', title: 'Still making things', body: 'This is the first line.\nThe private later paragraph stays on the full page.',
  responseLabel: 'Encouragement', mediaUrl: null, pillar: 'Create', craft: 'Art', createdAt: '2026-10-08T12:00:00Z', editedAt: null,
  up: 0, down: 0, score: 0, commentCount: 0, author: 'A creator', myVote: null,
} as Post;

test('wall cards show the heading and first line while full pages show the entire text', () => {
  const card = renderToStaticMarkup(<AuthProvider><PostCard post={post} /></AuthProvider>);
  assert.match(card, /Still making things/);
  assert.match(card, /This is the first line\./);
  assert.doesNotMatch(card, /The private later paragraph/);
  assert.match(card, /Encouragement/);
  assert.match(card, /href="\/posts\/00000000-0000-4000-8000-000000000001"/);
  const full = renderToStaticMarkup(<AuthProvider><PostCard post={post} details /></AuthProvider>);
  assert.match(full, /The private later paragraph/);
});

test('video cards link to a full player without autoplay and pending posts have no voting', () => {
  const video = { ...post, mediaKind: 'video' as const, mediaUrl: '/api/media/assets/test', status: 'pending' as const };
  const card = renderToStaticMarkup(<AuthProvider><PostCard post={video} /></AuthProvider>);
  assert.match(card, /Open post to play/); assert.doesNotMatch(card, /<video/); assert.doesNotMatch(card, /Upvote/);
  const full = renderToStaticMarkup(<AuthProvider><PostCard post={video} details /></AuthProvider>);
  assert.match(full, /<video[^>]*controls/); assert.doesNotMatch(full, /autoPlay|autoplay/); assert.match(full, /Awaiting a moderator/);
});
