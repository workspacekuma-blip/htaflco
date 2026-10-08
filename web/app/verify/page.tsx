'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function Verify() {
  const token = useSearchParams().get('token');
  const { refresh } = useAuth();
  const [state, setState] = useState<'working' | 'ok' | 'bad'>('working');
  const pending = useRef<{ token: string; request: Promise<unknown> } | null>(null);

  useEffect(() => {
    if (!token) return setState('bad');
    let active = true;
    setState('working');
    // Strict Mode replays effects. Reuse the request so a one-use token isn't consumed twice.
    if (pending.current?.token !== token) {
      pending.current = { token, request: api(`/auth/verify?token=${encodeURIComponent(token)}`) };
    }
    pending.current.request
      .then(() => { if (active) { setState('ok'); void refresh(); } })
      .catch(() => { if (active) setState('bad'); });
    return () => { active = false; };
  }, [token, refresh]);

  return (
    <div className="wrap page">
      {state === 'working' && <p>Verifying your email…</p>}
      {state === 'ok' && (<><h1 className="h2">Email verified.</h1><p>You can post, vote and comment now.</p><Link className="btn" href="/">Go to the wall</Link></>)}
      {state === 'bad' && (<><h1 className="h2">That link did not work.</h1><p>It may have expired. Log in and ask for a new verification email from the post box.</p><Link className="btn" href="/login">Log in</Link></>)}
    </div>
  );
}

export default function VerifyPage() {
  return <Suspense fallback={<div className="wrap page" />}><Verify /></Suspense>;
}
