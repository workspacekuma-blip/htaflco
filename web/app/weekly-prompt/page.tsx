'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import PostCard from '@/components/PostCard';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Page, Post, WeeklyPrompt } from '@/lib/types';

export default function WeeklyPromptPage() {
  const { me, loading } = useAuth(); const [prompt, setPrompt] = useState<WeeklyPrompt | null>(null);
  const [items, setItems] = useState<Post[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (loading) return; let active = true; setBusy(true); setError(''); setItems([]);
    api<{ prompt: WeeklyPrompt | null }>('/prompts/current', {}, 'public').then(async (r) => {
      if (!active) return; setPrompt(r.prompt);
      if (r.prompt) { const posts = await api<Page>(`/feed/browse?challenge=${r.prompt.id}`, {}, me?.id ?? 'guest'); if (active) { setItems(posts.items); setCursor(posts.nextCursor ?? null); } }
    }).catch((e) => { if (active) setError((e as Error).message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [me?.id, loading, attempt]);
  async function more() { if (!prompt || !cursor) return; setBusy(true); try { const r = await api<Page>(`/feed/browse?challenge=${prompt.id}&cursor=${encodeURIComponent(cursor)}`, {}, me?.id ?? 'guest'); setItems((prev) => [...prev, ...r.items]); setCursor(r.nextCursor ?? null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="wrap page"><p><Link href="/">Back to the wall</Link></p><h1 className="h2">This week&apos;s prompt</h1>
    {prompt && <div className="weekly-prompt"><h2>{prompt.title}</h2><p>{prompt.body}</p><p className="note">Week beginning {prompt.weekStart} (UTC)</p><Link href="/#wall">Share your response</Link></div>}
    {error && <p className="error" role="alert">{error} <button type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button></p>}
    <div className="grid">{items.map((p) => <PostCard key={p.id} post={p} />)}</div>
    {busy && <p role="status">Loading prompt responses…</p>}{!busy && !error && !prompt && <p>A weekly prompt hasn&apos;t been scheduled yet.</p>}
    {!busy && !error && prompt && !items.length && <p>No responses yet. Start with one small thing.</p>}{cursor && !busy && <button className="btn ghost" onClick={() => void more()}>Show more</button>}
  </div>;
}
