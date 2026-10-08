export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const pendingReads = new Map<string, Promise<unknown>>();

/** Share only concurrent post reads, scoped to the viewer. Never retain completed responses. */
export function api<T = unknown>(path: string, init: RequestInit = {}, readScope?: string): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET') pendingReads.clear();
  if (method !== 'GET' || readScope === undefined || path.startsWith('/auth/')) return request<T>(path, init, method === 'GET' && path === '/auth/me');
  const key = `${readScope}:${path}`;
  const pending = pendingReads.get(key);
  if (pending) return pending as Promise<T>;
  const result = request<T>(path, init, true).finally(() => {
    if (pendingReads.get(key) === result) pendingReads.delete(key);
  });
  pendingReads.set(key, result);
  return result;
}

async function request<T>(path: string, init: RequestInit, bounded: boolean): Promise<T> {
  try {
    const res = await fetch('/api' + path, {
      ...init,
      signal: init.signal ?? (bounded ? AbortSignal.timeout(75_000) : undefined),
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
      credentials: 'same-origin',
    });
    const data = await res.json().catch((e) => {
      if (e?.name === 'TimeoutError') throw e;
      if (res.ok) throw new ApiError(502, 'The community server returned an unreadable response. Please try again.');
      return {};
    });
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ??
      (bounded && res.status >= 500 ? 'The community server is temporarily unavailable. Please try again in a moment.' : 'Something went wrong'));
    return data as T;
  } catch (e) {
    if (bounded && (e as Error)?.name === 'TimeoutError') throw new ApiError(504, 'Posts are taking too long to load. Please try again in a moment.');
    throw e;
  }
}

export const json = (value: unknown): string => JSON.stringify(value);

export const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Tells the slider and feeds to reload after a new post. */
export const announcePosted = () => window.dispatchEvent(new Event('htafl:posted'));
