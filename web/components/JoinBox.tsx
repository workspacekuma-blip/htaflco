'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function JoinBox() {
  const { me, loading } = useAuth();
  const [members, setMembers] = useState<number | null>(null);

  useEffect(() => {
    api<{ members: number }>('/stats').then((r) => setMembers(r.members)).catch(() => setMembers(null));
  }, []);

  return (
    <div className="joinbox">
      {!loading && me && <p>You&apos;re in{me.displayName ? `, ${me.displayName}` : ''}. Welcome to The Creator Generation.</p>}
      {!loading && !me && (
        <>
          <p>Joining is free. Register, then post, vote and comment.</p>
          <Link className="btn light" href="/join">Join The Creator Generation</Link>
        </>
      )}
      {members !== null && <p className="small">{members === 0 ? 'Be the first to join.' : `${members} ${members === 1 ? 'creator has' : 'creators have'} joined.`}</p>}
    </div>
  );
}
