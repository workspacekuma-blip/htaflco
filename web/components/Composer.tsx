'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { announcePosted, api, json } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Pillar, PILLARS } from '@/lib/types';

const STARTERS: { text: string; pillar: Pillar }[] = [
  { text: "Right now I'm carrying", pillar: 'Overcome' },
  { text: 'I stopped making things when', pillar: 'Overcome' },
  { text: 'Something I want to build is', pillar: 'Create' },
];

/** Shrinks a picture in the browser before upload (max 1200px, JPEG). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that picture'))), 'image/jpeg', 0.82));
}

export default function Composer() {
  const { me, loading } = useAuth();
  const [starter, setStarter] = useState(STARTERS[0]);
  const [pillar, setPillar] = useState<Pillar>(STARTERS[0].pillar);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mediaOn, setMediaOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [support, setSupport] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean }>('/media/config').then((r) => setMediaOn(r.enabled)).catch(() => setMediaOn(false));
  }, []);

  async function submit() {
    const words = text.trim();
    if (!words) return setMsg('Even a few words is enough.');
    setBusy(true);
    setMsg('');
    try {
      let mediaKey: string | undefined;
      if (file) {
        const blob = await shrink(file);
        const up = await api<{ key: string; url: string }>('/media/upload-url', { method: 'POST', body: json({ contentType: 'image/jpeg' }) });
        const put = await fetch(up.url, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob });
        if (!put.ok) throw new Error('The picture could not be uploaded. Try again.');
        mediaKey = up.key;
      }
      const r = await api<{ supportNotice: boolean }>('/posts', {
        method: 'POST',
        body: json({ body: `${starter.text} ${words}`, pillar, mediaKey }),
      });
      setText('');
      setFile(null);
      setSupport(r.supportNotice);
      setMsg('Posted to your wall.');
      announcePosted();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      await api('/auth/resend-verification', { method: 'POST' });
      setMsg('Verification email sent. Check your inbox.');
    } catch (e) { setMsg((e as Error).message); }
  }

  if (loading) return null;
  if (!me) {
    return (
      <div className="wall">
        <h2>Start here. Finish one sentence.</h2>
        <p className="gate">Posting is for registered members. <Link href="/join">Join The Creator Generation</Link> or <Link href="/login">log in</Link>.</p>
      </div>
    );
  }

  return (
    <div className="wall" id="wall">
      <h2>Start here. Finish one sentence.</h2>
      {!me.emailVerified && (
        <p className="gate">Verify your email to post. <button type="button" className="linklike" onClick={() => void resend()}>Resend the email</button></p>
      )}
      <fieldset className="chips">
        <legend>Pick a sentence to start with</legend>
        {STARTERS.map((s) => (
          <label key={s.text}>
            <input type="radio" name="starter" checked={starter.text === s.text} onChange={() => { setStarter(s); setPillar(s.pillar); }} />
            <span>{s.text}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="chips">
        <legend>What kind of post is this?</legend>
        {PILLARS.map((p) => (
          <label key={p}>
            <input type="radio" name="pillar" checked={pillar === p} onChange={() => setPillar(p)} />
            <span>{p}</span>
          </label>
        ))}
      </fieldset>
      <p className="starter">{starter.text}…</p>
      <label htmlFor="words" className="note">Write the rest in your own words</label>
      <textarea id="words" value={text} maxLength={240 - starter.text.length - 1} onChange={(e) => setText(e.target.value)} />
      {mediaOn && (
        <label className="up">Add a picture (optional)
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      )}
      <button type="button" className="btn" disabled={busy} onClick={() => void submit()}>{busy ? 'Posting…' : 'Put it on the wall'}</button>
      {msg && <p className="note" role="status">{msg}</p>}
      {support && (
        <p className="gate" role="status">
          Thank you for sharing this. If things feel heavy right now, you don&apos;t have to carry it alone. Please reach out to someone you trust or a local support service.
          {/* TODO: add support resources for your members' region here */}
        </p>
      )}
      <p className="note">Post as often as you like. Every post stays on <Link href="/wall">your wall</Link>.</p>
    </div>
  );
}
