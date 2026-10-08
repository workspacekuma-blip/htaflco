'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function Header() {
  const { me, loading, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    setUnread(0);
    if (!me?.id) return;
    let active = true;
    const load = () => { if (document.visibilityState === 'visible') void api<{ unreadCount: number }>('/me/notifications?limit=1', {}, me.id).then((r) => { if (active) setUnread(r.unreadCount); }).catch(() => {}); };
    load(); const interval = setInterval(load, 60_000);
    window.addEventListener('htafl:notifications', load); document.addEventListener('visibilitychange', load);
    return () => { active = false; clearInterval(interval); window.removeEventListener('htafl:notifications', load); document.removeEventListener('visibilitychange', load); };
  }, [me?.id]);
  return (
    <header className="bar wrap">
      <Link className="mark" href="/">HTAFL</Link>
      <nav className="nav" aria-label="Main">
        <Link href="/about">About</Link>
        {me && <Link href="/wall">Your wall</Link>}
        {me && <Link href="/notifications">Notifications{unread > 0 ? ` (${unread})` : ''}</Link>}
        {me && (me.role === 'moderator' || me.role === 'admin') && <Link href="/admin">Moderation</Link>}
        {!loading && !me && <Link href="/login">Log in</Link>}
        {!loading && !me && <Link className="pill" href="/join">Join The Creator Generation</Link>}
        {me && (
          <button className="linklike" type="button" onClick={() => void logout()}>
            Log out{me.displayName ? ` (${me.displayName})` : ''}
          </button>
        )}
      </nav>
    </header>
  );
}
