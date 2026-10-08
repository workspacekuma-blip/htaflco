'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fmtDate, json } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ReplyNotification } from '@/lib/types';

export default function Notifications() {
  const { me, loading } = useAuth();
  const [items, setItems] = useState<ReplyNotification[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true); const [error, setError] = useState('');
  const [replyEmail, setReplyEmail] = useState<boolean | null>(null); const [saving, setSaving] = useState(false);
  const [preferenceMsg, setPreferenceMsg] = useState(''); const version = useRef(0);
  const load = useCallback(async (c: string | null) => {
    const request = ++version.current; setBusy(true); setError('');
    try {
      const r = await api<{ items: ReplyNotification[]; nextCursor: string | null }>('/me/notifications' + (c ? `?cursor=${encodeURIComponent(c)}` : ''), {}, me?.id);
      if (request !== version.current) return;
      setItems((prev) => c ? [...prev, ...r.items] : r.items); setCursor(r.nextCursor);
    } catch (e) { if (request === version.current) setError((e as Error).message); }
    finally { if (request === version.current) setBusy(false); }
  }, [me?.id]);
  useEffect(() => {
    setItems([]); setReplyEmail(null); setPreferenceMsg('');
    if (!me) return;
    let active = true; void load(null);
    api<{ replyEmail: boolean }>('/me/notification-preferences', {}, me.id).then((r) => { if (active) setReplyEmail(r.replyEmail); }).catch((e) => { if (active) setPreferenceMsg((e as Error).message); });
    return () => { active = false; version.current++; };
  }, [me?.id, load]);
  async function read(n: ReplyNotification) {
    if (n.readAt) return;
    try { await api(`/me/notifications/${n.id}/read`, { method: 'POST' }); setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)); window.dispatchEvent(new Event('htafl:notifications')); }
    catch (e) { setError((e as Error).message); }
  }
  async function preference(enabled: boolean) {
    setSaving(true); setPreferenceMsg('');
    try { const r = await api<{ replyEmail: boolean }>('/me/notification-preferences', { method: 'PATCH', body: json({ replyEmail: enabled }) }); setReplyEmail(r.replyEmail); setPreferenceMsg(enabled ? 'Reply emails turned on.' : 'Reply emails turned off.'); }
    catch (e) { setPreferenceMsg((e as Error).message); } finally { setSaving(false); }
  }
  if (loading) return <div className="wrap page"><p role="status">Loading…</p></div>;
  if (!me) return <div className="wrap page"><h1 className="h2">Notifications</h1><p><Link href="/login">Log in</Link> to see replies to your posts.</p></div>;
  return <div className="wrap page narrow"><h1 className="h2">Notifications</h1>
    <div className="weekly-prompt"><h2 className="notification-heading">Reply emails</h2><p className="note">Optional, off by default. Emails link to your post without including your story or the reply text. You can turn them off any time.</p>
      {replyEmail !== null && <label className="chk"><input type="checkbox" checked={replyEmail} disabled={saving} onChange={(e) => void preference(e.target.checked)} /> Email me when someone replies to my post</label>}
      {replyEmail === null && !preferenceMsg && <p role="status">Loading email settings…</p>}
      {preferenceMsg && <p className="note" role="status">{preferenceMsg}</p>}
    </div>
    {error && <p className="error" role="alert">{error} <button type="button" onClick={() => void load(null)}>Try again</button></p>}
    <ul className="notification-list">{items.map((n) => <li className="card" key={n.id}>
      <p className="cardmeta">{n.readAt ? 'Read' : 'New'} · {fmtDate(n.createdAt)}</p>
      <h2 className="notification-heading"><Link href={`/posts/${n.postId}`} onClick={() => void read(n)}>{n.author} replied to {n.postTitle || 'your post'}</Link></h2>
      <p>{n.body}</p>{!n.readAt && <button className="btn small" type="button" onClick={() => void read(n)}>Mark as read</button>}
    </li>)}</ul>
    {busy && <p role="status">Loading replies…</p>}{!busy && !error && !items.length && <p>No replies yet. Replies to your posts will appear here.</p>}
    {cursor && !busy && <button className="btn ghost" type="button" onClick={() => void load(cursor)}>Show more</button>}
  </div>;
}
