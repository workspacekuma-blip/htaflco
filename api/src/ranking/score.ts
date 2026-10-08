// Pure ranking logic (no database), so it is easy to test and tune.

/**
 * Wilson lower bound: a cautious estimate of the true share of upvotes.
 * Few votes pull the estimate down, so 2 early upvotes cannot beat 80 of 100.
 * About 0.72 for 10 unanimous upvotes and 0.96 for 100.
 */
export function wilsonLowerBound(up: number, down: number, z = 1.96): number {
  const n = up + down;
  if (n <= 0) return 0;
  const p = up / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

export interface FeaturedCandidate {
  postId: string;
  authorId: string;
  craft: string;
  createdAt: number; // ms
  up: number; // trust-weighted upvotes
  down: number; // trust-weighted downvotes
  voters: number; // distinct qualifying voters
}

/**
 * Featured: best Wilson score first, then walk down the list applying fairness rules:
 * one post per author and at most `maxPerCraft` per craft. A post needs enough
 * distinct voters and more upvotes than downvotes.
 */
export function selectFeatured(
  candidates: FeaturedCandidate[],
  opts: { minVoters: number; size?: number; maxPerCraft?: number },
): string[] {
  const size = opts.size ?? 5;
  const maxPerCraft = opts.maxPerCraft ?? 2;
  const ranked = candidates
    .filter((c) => c.voters >= opts.minVoters && c.up > c.down)
    .map((c) => ({ c, score: wilsonLowerBound(c.up, c.down) }))
    .sort(
      (a, b) =>
        b.score - a.score || b.c.up + b.c.down - (a.c.up + a.c.down) || b.c.createdAt - a.c.createdAt,
    );
  const authors = new Set<string>();
  const perCraft = new Map<string, number>();
  const out: string[] = [];
  for (const { c } of ranked) {
    if (out.length >= size) break;
    if (authors.has(c.authorId)) continue;
    if ((perCraft.get(c.craft) ?? 0) >= maxPerCraft) continue;
    authors.add(c.authorId);
    perCraft.set(c.craft, (perCraft.get(c.craft) ?? 0) + 1);
    out.push(c.postId);
  }
  return out;
}

export interface RisingCandidate {
  postId: string;
  authorId: string;
  createdAt: number; // ms
  momentum: number; // decayed, trust-weighted vote total
  recentVoters: number; // distinct qualifying voters in the last 6 hours
  newcomer: boolean; // author has fewer than 3 posts
}

/** A vote's weight fades with age: half-life of about 4 hours when tau is 6 hours. */
export const decay = (ageMs: number, tauMs = 6 * 3600_000): number => Math.exp(-ageMs / tauMs);

/**
 * Rising: highest decayed momentum, one post per author, with `reserve` spots held
 * for newcomers when any qualify. This is "participation before perfection" in code.
 */
export function selectRising(
  candidates: RisingCandidate[],
  opts: { minVoters: number; size?: number; reserve?: number },
): string[] {
  const size = opts.size ?? 8;
  const reserve = opts.reserve ?? 2;
  const eligible = candidates
    .filter((c) => c.recentVoters >= opts.minVoters && c.momentum > 0)
    .sort((a, b) => b.momentum - a.momentum || b.createdAt - a.createdAt);
  const authors = new Set<string>();
  const picked: RisingCandidate[] = [];
  const take = (c: RisingCandidate): void => {
    if (picked.length >= size || authors.has(c.authorId)) return;
    authors.add(c.authorId);
    picked.push(c);
  };
  let held = 0;
  for (const c of eligible) {
    if (held >= reserve) break;
    if (c.newcomer && !authors.has(c.authorId)) {
      take(c);
      held++;
    }
  }
  for (const c of eligible) if (!picked.includes(c)) take(c);
  return picked
    .sort((a, b) => b.momentum - a.momentum || b.createdAt - a.createdAt)
    .map((c) => c.postId);
}
