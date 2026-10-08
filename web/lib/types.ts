export type Pillar = 'Create' | 'Overcome' | 'Connect';
export const PILLARS: Pillar[] = ['Create', 'Overcome', 'Connect'];
export const CRAFTS = ['Art', 'Fashion', 'Music', 'Photography', 'Writing', 'Something else'] as const;
export const RESPONSE_LABELS = ['Encouragement', 'Constructive feedback', 'Looking for collaborators', 'Just sharing'] as const;
export type ResponseLabel = typeof RESPONSE_LABELS[number];
export interface WeeklyPrompt { id: string; weekStart: string; title: string; body: string }
export interface ReplyNotification { id: string; postId: string; postTitle: string | null; author: string; body: string; createdAt: string; readAt: string | null }

export interface Post {
  id: string;
  body: string;
  title: string | null;
  responseLabel: ResponseLabel;
  promptId: string | null;
  promptTitle: string | null;
  mediaUrl: string | null;
  mediaKind: 'picture' | 'video' | null;
  mediaAlt: string | null;
  status: 'published' | 'pending' | 'hidden' | 'removed';
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
