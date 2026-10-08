'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Page, Post } from '@/lib/types';
import PostCard from './PostCard';

export default function PostSlider() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [paused, setPaused] = useState(false);
  const hover = useRef(false);
  const track = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setPosts((await api<Page>('/feed/latest?limit=12')).items);
    } catch {
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener('htafl:posted', load);
    return () => window.removeEventListener('htafl:posted', load);
  }, [load]);

  const step = useCallback((dir: number) => {
    const t = track.current;
    const first = t?.firstElementChild as HTMLElement | null;
    if (!t || !first) return;
    const w = first.offsetWidth + 16;
    const max = t.scrollWidth - t.clientWidth;
    let x = t.scrollLeft + dir * w;
    if (x > max + 4) x = 0;
    if (x < 0) x = max;
    t.scrollTo({ left: x, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true);
  }, []);
  useEffect(() => {
    const id = setInterval(() => { if (!paused && !hover.current) step(1); }, 5000);
    return () => clearInterval(id);
  }, [paused, step]);

  return (
    <section className="reel wrap" aria-label="Posts from the community">
      <div className="reel-top">
        <h2>On the wall right now</h2>
        <div className="ctrls">
          <button type="button" aria-label="Previous post" onClick={() => step(-1)}>&lt;</button>
          <button type="button" aria-label="Next post" onClick={() => step(1)}>&gt;</button>
          <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Play' : 'Pause'}</button>
        </div>
      </div>
      <div className="track" ref={track} tabIndex={0}
        onMouseEnter={() => (hover.current = true)} onMouseLeave={() => (hover.current = false)}
        onFocus={() => (hover.current = true)} onBlur={() => (hover.current = false)}>
        {posts === null && <p className="note">Loading…</p>}
        {posts?.length === 0 && <p className="note">No posts yet. Be the first on the wall.</p>}
        {posts?.map((p) => <div className="slide" key={p.id}><PostCard post={p} /></div>)}
      </div>
    </section>
  );
}
