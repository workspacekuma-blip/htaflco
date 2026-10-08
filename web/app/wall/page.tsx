'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate, json } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Page, Post, RESPONSE_LABELS, ResponseLabel } from '@/lib/types';
import { postFirstLine, postHeading } from '@/lib/post-preview';

function WallItem({ post, onGone }: { post: Post; onGone: (id: string) => void }) {
  const [p, setP] = useState(post);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [title, setTitle] = useState(post.title ?? '');
  const [label, setLabel] = useState<ResponseLabel>(post.responseLabel || 'Just sharing');
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    const body = draft.trim();
    if (!body) return setMsg('A post needs at least a few words.');
    try {
      await api(`/posts/${p.id}`, { method: 'PATCH', body: json({ body, title: title.trim() || undefined, responseLabel: label }) });
      setP({ ...p, body, title: title.trim() || p.title, responseLabel: label, editedAt: new Date().toISOString() });
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
      {editing && p.mediaUrl && p.mediaKind !== 'video' && <img className="cardimg" src={p.mediaUrl} alt={p.mediaAlt || 'Your picture'} loading="lazy" />}
      {p.status !== 'published' && <p className="gate">{p.status === 'pending' ? 'Awaiting moderation. Only you and moderators can view this post.' : 'This post has been hidden by moderation.'}</p>}
      {editing ? (
        <>
          <label>Post heading<input className="post-title-input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></label>
          <textarea className="edit" value={draft} maxLength={10000} onChange={(e) => setDraft(e.target.value)} aria-label="Edit your post" />
          <label>Response label<select value={label} onChange={(e) => setLabel(e.target.value as ResponseLabel)}>{RESPONSE_LABELS.map((l) => <option key={l}>{l}</option>)}</select></label>
          <div className="acts">
            <button type="button" className="btn small" onClick={() => void save()}>Save changes</button>
            <button type="button" onClick={() => { setEditing(false); setDraft(p.body); setTitle(p.title ?? ''); setLabel(p.responseLabel || 'Just sharing'); }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <Link className="post-link" href={`/posts/${p.id}`} aria-label={`Read your post: ${postHeading(p)}`}>
            {p.mediaUrl && (p.mediaKind === 'video' ? <p className="video-preview">▶ Video · Open post to play</p> : <img className="cardimg" src={p.mediaUrl} alt={p.mediaAlt || 'Your picture'} loading="lazy" />)}
            <h3 className="cardtitle">{postHeading(p)}</h3><p className="cardpreview">{postFirstLine(p.body)}</p><span className="note">Read full post →</span>
          </Link>
          <p className="response-label">{p.responseLabel || 'Just sharing'}</p>
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
