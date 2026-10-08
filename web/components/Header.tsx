'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function Header() {
  const { me, loading, logout } = useAuth();
  return (
    <header className="bar wrap">
      <Link className="mark" href="/">HTAFL</Link>
      <nav className="nav" aria-label="Main">
        <Link href="/about">About</Link>
        {me && <Link href="/wall">Your wall</Link>}
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
