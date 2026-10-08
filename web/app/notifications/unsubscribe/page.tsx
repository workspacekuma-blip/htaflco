'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, json } from '@/lib/api';

function Preference() {
  const params = useSearchParams(); const token = params.get('token');
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [msg, setMsg] = useState('');
  async function unsubscribe() {
    setBusy(true); setMsg('');
    try { await api('/notifications/email-unsubscribe', { method: 'POST', body: json({ token }) }); setDone(true); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="wrap page narrow"><h1 className="h2">Reply email settings</h1>
    {done ? <p role="status">Reply emails are turned off. Your notifications remain available inside HTAFL.</p> : <><p>Turn off emails about replies to your posts?</p><button className="btn" type="button" disabled={busy || !token} onClick={() => void unsubscribe()}>{busy ? 'Saving…' : 'Turn off reply emails'}</button></>}
    {msg && <p className="error" role="alert">{msg}</p>}<p><Link href="/notifications">Open Notifications</Link></p>
  </div>;
}
export default function Unsubscribe() { return <Suspense fallback={<p role="status">Loading…</p>}><Preference /></Suspense>; }
