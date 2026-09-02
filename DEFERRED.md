# Deliberately not doing (yet)

Things considered and intentionally skipped during a fix, with why and what would change the call. Not a bug list — see git history/issues for those.

## Historical-month dashboards still render legacy CC MonthlyEntry data (2026-09-02)

The credit-card rework moved every screen onto `cardStatus()` / `CardStatement`
and deleted `cc-effects.ts`. The current-month dashboard, `/cards`, the Year
View and Vault are all on the new engine. The dashboard's `CCCardBlock` +
its drilldowns still render for **past and projected** months, off the frozen
legacy `MonthlyEntry` CC fields.

**Why:** wiring those months onto the derived `getCardCycleExpenseByMonth`
figure (as the Year View already does) means rewiring ~10 interdependent
metric values (committed, pending, cash-in-hand, the tile drilldowns) in a
2,400-line client component, with no way to integration-test a historical
snapshot. Left for a focused pass. New CC `MonthlyEntry` rows are no longer
created or written, so the legacy path goes dormant on its own as months roll
forward.

**What would change the call:** a wrong CC number on a past-month dashboard,
or once the current-month path has been verified in production.
