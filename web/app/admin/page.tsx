'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, json } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Report { id: string; targetType: string; targetId: string; reason: string; createdAt: string; postBody: string | null; postStatus: string | null }
interface Flagged { id: string; body: string; createdAt: string; author: string }

export default function Admin() {
  const { me, loading } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [flagged, setFlagged] = useState<Flagged[]>([]);
  const [msg, setMsg] = useState('');
  const allowed = me && (me.role === 'moderator' || me.role === 'admin');

  const load = useCallback(async () => {
    const [r, f] = await Promise.all([
      api<{ items: Report[] }>('/admin/reports'),
      api<{ items: Flagged[] }>('/admin/sensitive'),
    ]);
    setReports(r.items);
    setFlagged(f.items);
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
      {msg && <p className="error" role="alert">{msg}</p>}

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
