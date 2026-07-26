import crypto from "crypto";

// Plain `===`/`!==` on a computed HMAC leaks timing information proportional
// to how many leading bytes match, letting an attacker recover the expected
// signature byte-by-byte over enough attempts. `timingSafeEqual` compares in
// constant time — but it throws on mismatched lengths, so guard that first
// rather than let an attacker-controlled length crash the request.
export function safeEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
