export type Pillar = 'Create' | 'Overcome' | 'Connect';
export const PILLARS: Pillar[] = ['Create', 'Overcome', 'Connect'];
export const CRAFTS = ['Art', 'Fashion', 'Music', 'Photography', 'Writing', 'Something else'] as const;

export interface Post {
  id: string;
  body: string;
  mediaUrl: string | null;
  pillar: Pillar;
  craft: string;
  createdAt: string;
  editedAt: string | null;
  up: number;
  down: number;
  score: number;
  commentCount: number;
  author: string;
  myVote: 1 | -1 | null;
}

export interface Page {
  items: Post[];
  nextCursor?: string | null;
}

export interface Me {
  id: string;
  email: string;
  emailVerified: boolean;
  role: 'member' | 'moderator' | 'admin';
  displayName: string | null;
  craft: string | null;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: string;
}
