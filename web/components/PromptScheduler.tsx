'use client';
import { useEffect, useState } from 'react';
import { api, json } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { WeeklyPrompt } from '@/lib/types';

function thisMonday() {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export default function PromptScheduler() {
  const { me } = useAuth();
  const [items, setItems] = useState<WeeklyPrompt[]>([]);
  const [week, setWeek] = useState(thisMonday);
  const [title, setTitle] = useState(''); const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  async function load() { const r = await api<{ items: WeeklyPrompt[] }>('/admin/prompts', {}, me?.id); setItems(r.items); }
  useEffect(() => { void load().catch((e) => setMsg((e as Error).message)); }, [me?.id]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('');
    try { await api('/admin/prompts', { method: 'POST', body: json({ weekStart: week, title, body }) }); await load(); setMsg('Weekly prompt saved. It will appear during its scheduled week.'); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="prompt-admin"><h2>Weekly prompts</h2><p className="note">Weeks run from Monday 00:00 to the next Monday 00:00 UTC. You can schedule ahead or update this week; completed weeks stay as they were.</p>
    <form className="form narrow" onSubmit={(e) => void save(e)}>
      <label>Week beginning (Monday, UTC)<input type="date" required min={thisMonday()} value={week} onInput={(e) => setWeek(e.currentTarget.value)} onChange={(e) => setWeek(e.target.value)} /></label>
      <label>Prompt heading<input type="text" required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Creative prompt<textarea required maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save weekly prompt'}</button>
    </form>
    {msg && <p className="note" role="status">{msg}</p>}
    <ul className="prompt-list">{items.map((p) => <li key={p.id}><strong>{p.weekStart}: {p.title}</strong><p>{p.body}</p>{p.weekStart >= thisMonday() && <button type="button" onClick={() => { setWeek(p.weekStart); setTitle(p.title); setBody(p.body); setMsg(''); }}>Edit this week</button>}</li>)}</ul>
  </section>;
}
