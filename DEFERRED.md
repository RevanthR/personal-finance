# Deliberately not doing (yet)

Things considered and intentionally skipped during a fix, with why and what would change the call. Not a bug list — see git history/issues for those.

## Auto-mark-paid doesn't reverse itself (2026-08-02)

When a CC entry auto-closes as paid because it owes nothing (`isZeroCCBalance`
in `finance-utils.ts`), a later charge landing on that same card is **not**
auto-un-paid. Only the zero→owed direction is silent; owed→zero is handled
(creation time in `setup-month.ts`/`templates/route.ts`, and mid-month
self-heal in `cc-effects.ts`'s `reverseCCEffect`).

**Why:** there's no field distinguishing "the system closed this at zero"
from "the user deliberately tapped paid." Auto-reversing `isPaid` on a
manually-confirmed entry risks silently undoing a real user action just
because a late charge arrived. Doing this safely needs a new `autoPaid`
boolean on `MonthlyEntry` to gate the reversal — a schema change, not just
a logic change — so it was left out of the initial pass.

**What would change the call:** a real instance of a charge landing on an
already-auto-closed card (rare — would need a charge dated pre-statement-day
after the card already rolled in/settled at zero). If that happens, add the
`autoPaid` flag and gate the reversal on it.
