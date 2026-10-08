'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate, json } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Page, Post } from '@/lib/types';

function WallItem({ post, onGone }: { post: Post; onGone: (id: string) => void }) {
  const [p, setP] = useState(post);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    const body = draft.trim();
    if (!body) return setMsg('A post needs at least a few words.');
    try {
      await api(`/posts/${p.id}`, { method: 'PATCH', body: json({ body }) });
      setP({ ...p, body, editedAt: new Date().toISOString() });
      setEditing(false);
      setMsg('Post updated.');
    } catch (e) { setMsg((e as Error).message); }
  }

  async function remove() {
    try {
      await api(`/posts/${p.id}`, { method: 'DELETE' });
      onGone(p.id);
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <article className="card">
      {editing && p.mediaUrl && <img className="cardimg" src={p.mediaUrl} alt="Your picture" loading="lazy" />}
      {editing ? (
        <>
          <textarea className="edit" value={draft} maxLength={240} onChange={(e) => setDraft(e.target.value)} aria-label="Edit your post" />
          <div className="acts">
            <button type="button" className="btn small" onClick={() => void save()}>Save changes</button>
            <button type="button" onClick={() => { setEditing(false); setDraft(p.body); }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <Link className="post-link" href={`/posts/${p.id}`} aria-label={`View your post: ${p.body}`}>
            {p.mediaUrl && <img className="cardimg" src={p.mediaUrl} alt="Your picture" loading="lazy" />}
            <p className="cardtext">{p.body}</p>
          </Link>
          <p className="cardmeta">{p.pillar} &middot; {fmtDate(p.createdAt)}{p.editedAt ? ' · edited' : ''} &middot; score {p.score} &middot; {p.commentCount} comments</p>
          <div className="acts">
            {confirming ? (
              <>
                <span>Delete this post for good?</span>
                <button type="button" className="danger" onClick={() => void remove()}>Yes, delete</button>
                <button type="button" onClick={() => setConfirming(false)}>Keep it</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setEditing(true)}>Edit</button>
                <button type="button" className="danger" onClick={() => setConfirming(true)}>Delete</button>
              </>
            )}
          </div>
        </>
      )}
      {msg && <p className="cardmsg" role="status">{msg}</p>}
    </article>
  );
}

export default function Wall() {
  const { me, loading } = useAuth();
  const [items, setItems] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (c: string | null) => {
    setBusy(true);
    setError('');
    try {
      const r = await api<Page>('/me/wall?limit=20' + (c ? `&cursor=${encodeURIComponent(c)}` : ''), {}, me?.id ?? 'guest');
      setItems((prev) => (c ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor ?? null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [me?.id]);

  useEffect(() => { if (me?.id) void load(null); }, [me?.id, load]);

  if (loading) return <div className="wrap page" />;
  if (!me) return <div className="wrap page"><h1 className="h2">Your wall</h1><p><Link href="/login">Log in</Link> or <Link href="/join">join</Link> to see your posts.</p></div>;

  return (
    <div className="wrap page">
      <h1 className="h2">Your wall</h1>
      <p>Everything you post stays here. You can edit your words or delete a post any time.</p>
      <div className="grid">{items.map((p) => <WallItem key={p.id} post={p} onGone={(id) => setItems((xs) => xs.filter((x) => x.id !== id))} />)}</div>
      {!busy && !error && items.length === 0 && <p className="note">Nothing here yet. <Link href="/">Make your first post</Link>.</p>}
      {error && <p className="error" role="alert">{error} <button type="button" onClick={() => void load(cursor)}>Try again</button></p>}
      {busy && <p className="note" role="status">Loading posts…</p>}
      {cursor && !busy && <button type="button" className="btn ghost" onClick={() => void load(cursor)}>Show more</button>}
    </div>
  );
}
