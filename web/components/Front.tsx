'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CRAFTS, Page, PILLARS, Post } from '@/lib/types';
import PostCard from './PostCard';

const TABS = [
  { id: 'rising', label: 'Rising', note: 'Posts picking up votes in the last day.', empty: 'Nothing is rising yet. Upvotes from the last day will show up here.' },
  { id: 'latest', label: 'Latest', note: 'The newest posts first.', empty: 'No posts yet. Be the first on the wall.' },
  { id: 'browse', label: 'Browse', note: 'Filter by kind of post and what it is about.', empty: 'No posts match those filters yet.' },
] as const;

function FeedList({ path, empty }: { path: string; empty: string }) {
  const { me } = useAuth();
  const [items, setItems] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);

  const load = useCallback(async (c: string | null) => {
    const version = ++request.current;
    setLoading(true);
    setError('');
    try {
      const sep = path.includes('?') ? '&' : '?';
      const r = await api<Page>(path + (c ? `${sep}cursor=${encodeURIComponent(c)}` : ''));
      if (version !== request.current) return;
      setItems((prev) => (c ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor ?? null);
    } catch (e) {
      if (version === request.current) setError((e as Error).message);
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(null);
    const again = () => void load(null);
    window.addEventListener('htafl:posted', again);
    return () => { request.current++; window.removeEventListener('htafl:posted', again); };
  }, [load, me?.id]);

  return (
    <div>
      <div className="grid">{items.map((p) => <PostCard key={p.id} post={p} />)}</div>
      {!loading && !error && items.length === 0 && <p className="note">{empty}</p>}
      {error && <p className="error" role="alert">{error} <button type="button" onClick={() => void load(cursor)}>Try again</button></p>}
      {loading && <p className="note">Loading…</p>}
      {cursor && !loading && <button type="button" className="btn ghost" onClick={() => void load(cursor)}>Show more</button>}
    </div>
  );
}

export default function Front() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('rising');
  const [pillar, setPillar] = useState('');
  const [craft, setCraft] = useState('');
  const t = TABS.find((x) => x.id === tab)!;

  const path =
    tab === 'browse'
      ? `/feed/browse?limit=12${pillar ? `&pillar=${pillar}` : ''}${craft ? `&craft=${encodeURIComponent(craft)}` : ''}`
      : tab === 'latest' ? '/feed/latest?limit=12' : `/feed/${tab}`;

  return (
    <section className="front wrap" aria-label="Rising, Latest and Browse">
      <div className="tabs" role="tablist" aria-label="Browse the wall">
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>
      <p className="note">{t.note}</p>
      {tab === 'browse' && (
        <div className="filters">
          <label>Kind of post
            <select value={pillar} onChange={(e) => setPillar(e.target.value)}>
              <option value="">All</option>
              {PILLARS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>What it is about
            <select value={craft} onChange={(e) => setCraft(e.target.value)}>
              <option value="">All</option>
              {CRAFTS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
      )}
      <FeedList key={path} path={path} empty={t.empty} />
    </section>
  );
}
