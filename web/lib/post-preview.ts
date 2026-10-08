import type { Post } from './types';

export function postHeading(post: Pick<Post, 'title' | 'pillar' | 'craft'>) {
  return post.title || `${post.pillar} · ${post.craft}`;
}
export function postFirstLine(body: string) {
  return body.trim().split(/\r?\n/).find((line) => line.trim())?.trim() ?? '';
}
