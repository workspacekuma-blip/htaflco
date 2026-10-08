'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, fmtDate, json } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Comment, Post } from '@/lib/types';

type VoteResult = { up: number; down: number; score: number; myVote: 1 | -1 | null };

export default function PostCard({ post, details = false }: { post: Post; details?: boolean }) {
  const { me } = useAuth();
  const [p, setP] = useState(post);
  const [open, setOpen] = useState(details);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => { setP(post); }, [post]);
  useEffect(() => {
    if (!details) return;
    let active = true;
    api<{ items: Comment[] }>(`/posts/${post.id}/comments`, {}, me?.id ?? 'guest')
      .then((r) => { if (active) setComments(r.items); })
      .catch((e) => { if (active) setMsg((e as Error).message); });
    return () => { active = false; };
  }, [details, post.id, me?.id]);

  async function vote(v: 1 | -1) {
    if (!me) return setMsg('Log in to vote.');
    try {
      const r = await api<VoteResult>(`/posts/${p.id}/vote`, { method: 'PUT', body: json({ value: p.myVote === v ? 0 : v }) });
      setP({ ...p, ...r });
      setMsg('');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function toggleComments() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) {
      try {
        const r = await api<{ items: Comment[] }>(`/posts/${p.id}/comments`, {}, me?.id ?? 'guest');
        setComments(r.items);
      } catch (e) { setMsg((e as Error).message); }
    }
  }

  async function addComment() {
    const body = text.trim();
    if (!body) return;
    try {
      await api(`/posts/${p.id}/comments`, { method: 'POST', body: json({ body }) });
      const r = await api<{ items: Comment[] }>(`/posts/${p.id}/comments`, {}, me?.id ?? 'guest');
      setComments(r.items);
      setP({ ...p, commentCount: r.items.length });
      setText('');
      setMsg('');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function report() {
    if (!me) return setMsg('Log in to report.');
    if (reason.trim().length < 3) return setMsg('Please describe the problem in at least three characters.');
    setReportBusy(true);
    try {
      await api('/reports', { method: 'POST', body: json({ targetType: 'post', targetId: p.id, reason }) });
      setMsg('Thank you. A moderator will take a look.');
      setReporting(false);
      setReason('');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <article className={`card${details ? ' post-detail' : ''}`}>
      {details ? (
        <>
          {p.mediaUrl && <img className="cardimg" src={p.mediaUrl} alt={`Picture shared by ${p.author}`} />}
          <p className="cardtext">{p.body}</p>
        </>
      ) : (
        <Link className="post-link" href={`/posts/${p.id}`} aria-label={`View post by ${p.author}: ${p.body}`}>
          {/* Plain img on purpose: pictures come from your own storage domain */}
          {p.mediaUrl && <img className="cardimg" src={p.mediaUrl} alt={`Picture shared by ${p.author}`} loading="lazy" />}
          <p className="cardtext">{p.body}</p>
        </Link>
      )}
      <p className="cardmeta">{p.author} &middot; {p.pillar} &middot; {fmtDate(p.createdAt)}{p.editedAt ? ' · edited' : ''}</p>
      {details && <p className="cardmeta">{p.craft} &middot; {new Date(p.createdAt).toLocaleString()}</p>}
      <div className="acts">
        <span className="vote">
          <button type="button" aria-label="Upvote" aria-pressed={p.myVote === 1} onClick={() => void vote(1)}>▲</button>
          <span className="sc" aria-label="Score">{p.score}</span>
          <button type="button" aria-label="Downvote" aria-pressed={p.myVote === -1} onClick={() => void vote(-1)}>▼</button>
        </span>
        <button type="button" onClick={() => void toggleComments()} aria-expanded={open}>Comment {p.commentCount}</button>
        <button type="button" className="quiet" onClick={() => me ? setReporting(!reporting) : setMsg('Log in to report.')}>Report</button>
      </div>
      {reporting && (
        <div className="comments">
          <label>What is wrong with this post?
            <textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="acts">
            <button type="button" disabled={reportBusy} onClick={() => void report()}>{reportBusy ? 'Sending…' : 'Send report'}</button>
            <button type="button" onClick={() => setReporting(false)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className="cardmsg" role="status">{msg}</p>}
      {open && (
        <div className="comments">
          <ul>
            {comments === null && <li role="status">Loading comments…</li>}
            {(comments ?? []).map((c) => (
              <li key={c.id}><strong>{c.author}:</strong> {c.body}</li>
            ))}
            {comments && comments.length === 0 && <li>No comments yet. Say something kind.</li>}
          </ul>
          {me ? (
            <div className="row">
              <input type="text" value={text} maxLength={500} placeholder="Write a comment" aria-label="Write a comment"
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addComment()} />
              <button type="button" className="btn small" onClick={() => void addComment()}>Post</button>
            </div>
          ) : (
            <p><Link href="/join">Join</Link> or <Link href="/login">log in</Link> to comment.</p>
          )}
        </div>
      )}
    </article>
  );
}
