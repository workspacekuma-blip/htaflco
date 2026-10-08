'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api, json } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CRAFTS } from '@/lib/types';

export default function Join() {
  const { me, loading, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [craft, setCraft] = useState<string>('Something else');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!agree) return setError('Please agree to the promise to join.');
    setBusy(true);
    setError('');
    try {
      await api('/auth/register', { method: 'POST', body: json({ email, password, displayName, craft, agree: true }) });
      await refresh();
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="wrap page" />;
  if (done) {
    return (
      <div className="wrap page">
        <h1 className="h2">Welcome to The Creator Generation.</h1>
        <p>We sent a verification link to {email}. Open it to start posting.</p>
        <Link className="btn" href="/">Go to the wall</Link>
      </div>
    );
  }
  if (me) return <div className="wrap page"><h1 className="h2">You&apos;re already in.</h1><Link className="btn" href="/">Go to the wall</Link></div>;

  return (
    <div className="wrap page narrow">
      <h1 className="h2">Join The Creator Generation</h1>
      <p>Free to join. Everyone here is going through something, and building anyway.</p>
      <form onSubmit={submit} className="form">
        <label>Display name (shown on your posts)
          <input type="text" required minLength={2} maxLength={30} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
        </label>
        <label>Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>Password (at least 10 characters)
          <input type="password" required minLength={10} maxLength={100} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="password-limit" />
        </label>
        <p className="note" id="password-limit">Up to 72 bytes. Emoji and some other characters use more than one byte.</p>
        <fieldset className="chips">
          <legend>What do you create?</legend>
          {CRAFTS.map((c) => (
            <label key={c}><input type="radio" name="craft" checked={craft === c} onChange={() => setCraft(c)} /><span>{c}</span></label>
          ))}
        </fieldset>
        <label className="chk">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I&apos;ll be kind, post my own work, and respect other creators.</span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join The Creator Generation'}</button>
        <p className="small">Already a member? <Link href="/login">Log in</Link></p>
      </form>
    </div>
  );
}
