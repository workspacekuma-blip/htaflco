'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, json } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import PromptScheduler from '@/components/PromptScheduler';
import { Post } from '@/lib/types';

interface Report { id: string; targetType: string; targetId: string; reason: string; createdAt: string; postBody: string | null; postStatus: string | null }
interface Flagged { id: string; body: string; createdAt: string; author: string }

export default function Admin() {
  const { me, loading } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [flagged, setFlagged] = useState<Flagged[]>([]);
  const [media, setMedia] = useState<Post[]>([]);
  const [reviewMedia, setReviewMedia] = useState(false);
  const [msg, setMsg] = useState('');
  const allowed = me && (me.role === 'moderator' || me.role === 'admin');

  const load = useCallback(async () => {
    const [r, f, m, settings] = await Promise.all([
      api<{ items: Report[] }>('/admin/reports'),
      api<{ items: Flagged[] }>('/admin/sensitive'),
      api<{ items: Post[] }>('/admin/media-pending'),
      api<{ pendingReview: boolean }>('/media/config'),
    ]);
    setReports(r.items);
    setFlagged(f.items);
    setMedia(m.items);
    setReviewMedia(settings.pendingReview);
  }, []);

  useEffect(() => { if (allowed) void load().catch((e) => setMsg((e as Error).message)); }, [allowed, load]);

  async function run(fn: () => Promise<unknown>) {
    try { await fn(); setMsg(''); await load(); } catch (e) { setMsg((e as Error).message); }
  }
  const setStatus = (id: string, status: 'hidden' | 'removed') => api(`/admin/posts/${id}/status`, { method: 'POST', body: json({ status }) });

  if (loading) return <div className="wrap page" />;
  if (!allowed) return <div className="wrap page"><h1 className="h2">Moderation</h1><p>This page is for moderators.</p></div>;

  return (
    <div className="wrap page">
      <h1 className="h2">Moderation</h1>
      <PromptScheduler />
      {msg && <p className="error" role="alert">{msg}</p>}

      {reviewMedia && <section>
      <h2>Pictures and videos awaiting review ({media.length})</h2>
      <p className="note">Review the complete post and attachment before publishing. This is human review; files have not been automatically scanned for unsafe content. Video: watch the whole clip and listen to its audio.</p>
      {!media.length && <p className="note">No media posts awaiting review.</p>}
      <div className="grid">{media.map((p) => <article className="card" key={p.id}>
        <h3>{p.title || `Post by ${p.author}`}</h3>
        {p.mediaUrl && (p.mediaKind === 'video' ? <video className="cardimg" controls playsInline preload="metadata" src={p.mediaUrl} aria-label={p.mediaAlt || `Video by ${p.author}`} /> : <img className="cardimg" src={p.mediaUrl} alt={p.mediaAlt || `Picture by ${p.author}`} />)}
        {p.mediaAlt && <p className="note">{p.mediaAlt}</p>}
        <p className="cardtext">{p.body}</p><p className="cardmeta">{p.author} · {p.responseLabel}</p>
        <div className="acts"><button type="button" onClick={() => void run(() => api(`/admin/posts/${p.id}/approve-media`, { method: 'POST' }))}>Approve and publish</button>
          <button type="button" onClick={() => void run(() => setStatus(p.id, 'hidden'))}>Hide</button></div>
      </article>)}</div>
      </section>}

      <h2>Open reports ({reports.length})</h2>
      {reports.length === 0 && <p className="note">No open reports.</p>}
      <div className="grid">
        {reports.map((r) => (
          <article className="card" key={r.id}>
            <p className="cardmeta">{r.targetType} &middot; reason: {r.reason}</p>
            {r.postBody && <p className="cardtext">{r.postBody}</p>}
            <div className="acts">
              {r.targetType === 'post' && <button type="button" onClick={() => void run(() => setStatus(r.targetId, 'hidden'))}>Hide post</button>}
              {r.targetType === 'post' && <button type="button" className="danger" onClick={() => void run(() => setStatus(r.targetId, 'removed'))}>Remove post</button>}
              <button type="button" onClick={() => void run(() => api(`/admin/reports/${r.id}/resolve`, { method: 'POST' }))}>Resolve</button>
            </div>
          </article>
        ))}
      </div>

      <h2>Flagged for a human look ({flagged.length})</h2>
      <p className="note">These posts may signal someone is struggling. Check on the author with care. They are never featured until you clear them.</p>
      <div className="grid">
        {flagged.map((f) => (
          <article className="card" key={f.id}>
            <p className="cardtext">{f.body}</p>
            <p className="cardmeta">{f.author}</p>
            <div className="acts">
              <button type="button" onClick={() => void run(() => api(`/admin/posts/${f.id}/clear-sensitive`, { method: 'POST' }))}>Mark as reviewed</button>
              <button type="button" onClick={() => void run(() => setStatus(f.id, 'hidden'))}>Hide</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
