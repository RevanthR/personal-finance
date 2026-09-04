// Shared token-overlap scoring used by card-match.ts, dedupe.ts, and
// entry-match.ts — previously each file reimplemented normalizeTokens +
// the overlap-counting loop independently, so a fix to the core algorithm
// (e.g. punctuation handling) had to be applied three times by hand and
// could silently drift out of sync. What legitimately differs per caller
// (the divisor mode, the stopword list, the match threshold) stays local to
// each file — those are deliberate, documented domain-specific tuning
// decisions, not something that should converge.
function normalizeTokens(s: string, stopwords?: Set<string>): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t && !stopwords?.has(t)),
  );
}

export type OverlapMode = "jaccard" | "containment";

// "jaccard" divides by the larger token set — penalizes any size mismatch,
// suited to comparing two names of roughly the same shape (card-match.ts).
// "containment" divides by the smaller token set — doesn't unfairly punish
// a full match of a short name against a longer, more verbose one (a bank
// alert's merchant text, or a UPI payee string) — used by dedupe.ts and
// entry-match.ts.
export function tokenOverlapScore(a: string, b: string, opts?: { stopwords?: Set<string>; mode?: OverlapMode }): number {
  const ta = normalizeTokens(a, opts?.stopwords);
  const tb = normalizeTokens(b, opts?.stopwords);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  const denom = opts?.mode === "jaccard" ? Math.max(ta.size, tb.size) : Math.min(ta.size, tb.size);
  return overlap / denom;
}

// Groups items whose names are likely the same real-world merchant
// ("Swiggy", "SWIGGY*BANGALORE", "Swiggy Order #4471") into one cluster
// instead of listing every raw string variant separately — a "Top
// Merchants" view built on exact-name grouping alone would fragment into
// near-duplicates for anything parsed from bank/UPI alert text. Containment
// mode (see tokenOverlapScore) is the right shape here: a short name like
// "Swiggy" should fully match against a longer, more specific variant.
// Greedy and O(distinct names²), not O(transactions²) — exact-name totals
// are pre-aggregated first, so the expensive comparison only ever runs
// against the handful of distinct strings, not every individual charge.
export function clusterByName<T>(
  items: T[],
  getName: (item: T) => string,
  getAmount: (item: T) => number,
  threshold = 0.6,
): { name: string; total: number; count: number }[] {
  const exact = new Map<string, { total: number; count: number }>();
  for (const item of items) {
    const name = getName(item).trim();
    if (!name) continue;
    const amt = getAmount(item);
    const ex = exact.get(name);
    if (ex) { ex.total += amt; ex.count++; }
    else exact.set(name, { total: amt, count: 1 });
  }

  // Highest-spend names first, so a cluster's display name ends up being
  // whichever real variant accounts for the most money, not just whichever
  // string happened to be seen first.
  const candidates = [...exact.entries()]
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.total - a.total);

  const clusters: { name: string; total: number; count: number }[] = [];
  for (const c of candidates) {
    let best: { cluster: (typeof clusters)[number]; score: number } | null = null;
    for (const cluster of clusters) {
      const score = tokenOverlapScore(c.name, cluster.name, { mode: "containment" });
      if (score >= threshold && (!best || score > best.score)) best = { cluster, score };
    }
    if (best) {
      best.cluster.total += c.total;
      best.cluster.count += c.count;
    } else {
      clusters.push({ name: c.name, total: c.total, count: c.count });
    }
  }
  return clusters.sort((a, b) => b.total - a.total);
}
