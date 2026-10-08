'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Post } from '@/lib/types';
import PostCard from '@/components/PostCard';

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const { me, loading } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (loading) return;
    let active = true;
    setPost(null);
    setError('');
    api<Post>(`/posts/${encodeURIComponent(id)}`, {}, me?.id ?? 'guest')
      .then((p) => { if (active) setPost(p); })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof ApiError && e.status === 404 ? 'This post is no longer available.' :
          e instanceof ApiError && e.status === 400 ? 'This post link is not valid.' : (e as Error).message);
      });
    return () => { active = false; };
  }, [id, me?.id, loading, attempt]);

  return (
    <div className="wrap page narrow">
      <p><Link href="/">Back to the wall</Link></p>
      <h1 className="h2">{post ? `Post by ${post.author}` : 'Post details'}</h1>
      {!post && !error && <p className="note" role="status">Loading post…</p>}
      {error && <p className="error" role="alert">{error} <button type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button></p>}
      {post && <PostCard key={post.id} post={post} details />}
    </div>
  );
}
