// Shared token-overlap scoring used by card-match.ts, dedupe.ts, and
// entry-match.ts — previously each file reimplemented normalizeTokens +
// the overlap-counting loop independently, so a fix to the core algorithm
// (e.g. punctuation handling) had to be applied three times by hand and
// could silently drift out of sync. What legitimately differs per caller
// (the divisor mode, the stopword list, the match threshold) stays local to
// each file — those are deliberate, documented domain-specific tuning
// decisions, not something that should converge.
export function normalizeTokens(s: string, stopwords?: Set<string>): Set<string> {
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
