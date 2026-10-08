'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { announcePosted, api, json } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Pillar, PILLARS, RESPONSE_LABELS, ResponseLabel, WeeklyPrompt } from '@/lib/types';

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
  const [title, setTitle] = useState('');
  const [responseLabel, setResponseLabel] = useState<ResponseLabel>('Just sharing');
  const [prompt, setPrompt] = useState<WeeklyPrompt | null>(null);
  const [joinPrompt, setJoinPrompt] = useState(false);
  const [promptError, setPromptError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mediaOn, setMediaOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [reviewMedia, setReviewMedia] = useState(false);
  const [mediaAlt, setMediaAlt] = useState('');
  const uploaded = useRef<{ file: File; key: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [support, setSupport] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean; videoEnabled: boolean; pendingReview: boolean }>('/media/config').then((r) => { setMediaOn(r.enabled); setVideoOn(r.videoEnabled); setReviewMedia(r.pendingReview); }).catch(() => setMediaOn(false));
  }, []);

  async function loadPrompt() {
    try { const r = await api<{ prompt: WeeklyPrompt | null }>('/prompts/current', {}, 'public'); setPrompt(r.prompt); setPromptError(''); }
    catch (e) { setPromptError((e as Error).message); }
  }
  useEffect(() => { void loadPrompt(); }, []);

  async function submit() {
    const words = text.trim();
    if (!words) return setMsg('Even a few words is enough.');
    if (!title.trim()) return setMsg('Give your post a heading.');
    setBusy(true);
    setMsg('');
    try {
      let mediaKey: string | undefined;
      if (file) {
        const video = file.type === 'video/mp4';
        if (video && !videoOn) throw new Error('Video uploads are not available yet.');
        if (!video && !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP picture or MP4 video.');
        if (file.size > (video ? 10_000_000 : 5_000_000)) throw new Error(video ? 'Use an MP4 up to 10 MB and 30 seconds.' : 'Choose a picture up to 5 MB.');
        if (uploaded.current?.file === file) mediaKey = uploaded.current.key;
        else {
          const blob = video ? file : await shrink(file);
          if (!video && blob.size > 2_000_000) throw new Error('That picture is too large after compression. Choose a smaller picture.');
          const contentType = video ? 'video/mp4' : 'image/jpeg';
          const up = await api<{ key: string; url: string }>('/media/upload-url', { method: 'POST', body: json({ contentType }) });
          const put = await fetch(up.url, { method: 'PUT', headers: { 'content-type': contentType }, body: blob });
          if (!put.ok) throw new Error('The attachment could not be uploaded. Your draft is kept; try again.');
          mediaKey = up.key; uploaded.current = { file, key: up.key };
        }
      }
      const r = await api<{ supportNotice: boolean; pendingReview: boolean }>('/posts', {
        method: 'POST',
        body: json({ title: title.trim(), body: `${starter.text} ${words}`, responseLabel, promptId: joinPrompt ? prompt?.id : undefined, pillar, mediaKey, mediaAlt: file ? mediaAlt : undefined }),
      });
      setText('');
      setTitle('');
      setFile(null);
      setMediaAlt(''); uploaded.current = null;
      if (fileInput.current) fileInput.current.value = '';
      setSupport(r.supportNotice);
      setMsg(r.pendingReview ? 'Saved to your wall for moderation. Your picture or video becomes public after review.' : 'Posted to your wall.');
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
        {prompt && <div className="weekly-prompt"><p className="note">This week&apos;s prompt</p><h3>{prompt.title}</h3><p>{prompt.body}</p><Link href="/weekly-prompt">See responses</Link></div>}
        <p className="gate">Posting is for registered members. <Link href="/join">Join The Creator Generation</Link> or <Link href="/login">log in</Link>.</p>
      </div>
    );
  }

  return (
    <div className="wall" id="wall">
      <h2>Start here. Finish one sentence.</h2>
      {prompt && <div className="weekly-prompt"><p className="note">This week&apos;s prompt · week of {prompt.weekStart} (UTC)</p><h3>{prompt.title}</h3><p>{prompt.body}</p>
        <p><Link href="/weekly-prompt">See responses</Link></p>
        <label className="chk"><input type="checkbox" checked={joinPrompt} onChange={(e) => setJoinPrompt(e.target.checked)} /> My post responds to this prompt</label></div>}
      {promptError && <p className="error" role="alert">Weekly prompt could not load. <button type="button" onClick={() => void loadPrompt()}>Try again</button></p>}
      <label className="note" htmlFor="post-title">Post heading</label>
      <input className="post-title-input" id="post-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
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
      <textarea id="words" value={text} maxLength={10000 - starter.text.length - 1} onChange={(e) => setText(e.target.value)} />
      <p className="note">{starter.text.length + 1 + text.length}/10,000 characters. The wall shows your heading and first line; open the post to read everything.</p>
      <label className="note" htmlFor="response-label">What response would help?</label>
      <select id="response-label" value={responseLabel} onChange={(e) => setResponseLabel(e.target.value as ResponseLabel)}>
        {RESPONSE_LABELS.map((label) => <option key={label}>{label}</option>)}
      </select>
      {mediaOn && (
        <div className="media-upload">
          <label className="up">Add a picture{videoOn ? ' or video' : ''} (optional)
            <input ref={fileInput} type="file" disabled={busy} accept={`image/jpeg,image/png,image/webp${videoOn ? ',video/mp4' : ''}`} onChange={(e) => { setFile(e.target.files?.[0] ?? null); uploaded.current = null; }} />
          </label>
          <p className="note">Pictures: JPEG, PNG or WebP up to 5 MB, compressed before upload.{videoOn && ' Video: one MP4 up to 10 MB and 30 seconds.'} {reviewMedia && 'Media posts are private until a moderator reviews them.'}</p>
          {file && <label className="note">Describe the picture or video for someone who cannot see it<input value={mediaAlt} maxLength={300} onChange={(e) => setMediaAlt(e.target.value)} /></label>}
        </div>
      )}
      <button type="button" className="btn" disabled={busy || !me.emailVerified} onClick={() => void submit()}>{busy ? 'Saving your post…' : 'Put it on the wall'}</button>
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
