// Live INR exchange rate lookup, used when a card transaction is billed in
// a foreign currency (bank alert emails show the foreign-currency amount,
// never the INR-converted one — that's only known after settlement, with
// the bank's forex markup applied). Frankfurter is free, needs no API key,
// and is backed by ECB daily rates.
const FRANKFURTER_TIMEOUT_MS = 5_000;

// Per-process cache so multiple transactions in the same currency within
// one sync run only hit the API once. Not persisted — a few-minutes-stale
// rate is irrelevant next to the review queue's "confirm before adding"
// safety net.
const rateCache = new Map<string, number>();

export async function getInrRate(currency: string): Promise<number | null> {
  const code = currency.toUpperCase();
  if (code === "INR") return 1;

  const cached = rateCache.get(code);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FRANKFURTER_TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${code}&to=INR`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json();
    const rate = data?.rates?.INR;
    if (typeof rate !== "number") return null;

    rateCache.set(code, rate);
    return rate;
  } catch {
    // Timeout, network error, or unsupported currency code — the caller
    // falls back to Gemini's own rough estimate, then to the raw number.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
