# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev             # start dev server (port 3000)
npm run build           # prisma generate + next build
npm run lint            # eslint
npm test                # vitest — covers finance-utils.ts's pure functions and cc-effects.ts's ledger recompute (via a hand-rolled fake Prisma client)

npm run db:migrate      # create + apply a new migration from schema changes (see DB migrations below)
npm run db:migrate:deploy  # apply pending migrations without prompting — CI/prod
npm run db:generate     # regenerate Prisma client after schema changes
npm run db:studio       # open Prisma Studio
```

Type-check with `npx tsc --noEmit`.

## Environment

Requires `.env` (not committed):
- `DATABASE_URL` — Neon PostgreSQL connection string (pooled)
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth
- `AUTH_SECRET` — NextAuth secret
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web Push

## Architecture

**Next.js 16 App Router** PWA, deployed to Vercel. Test coverage is partial (see `npm test`) — vitest with unit tests for the pure functions in `src/lib/finance-utils.ts`, plus `src/lib/cc-effects.ts`'s self-healing CC ledger recompute (`cc-effects.test.ts` fakes the small slice of the Prisma client it calls rather than hitting a real DB); most other modules aren't covered yet.

### Route groups
- `src/app/(app)/` — authenticated app pages (dashboard, months, templates, chits, settings). Layout at `(app)/layout.tsx` enforces auth.
- `src/app/admin/` — admin-only user management.
- `src/app/api/` — all API routes; every route checks `auth()` from `src/lib/auth.ts`.

### Pages → Components pattern
Server pages (`page.tsx`) do all DB queries via `db` (Prisma singleton in `src/lib/db.ts`), then pass serialised data to a `*Client` component via `JSON.parse(JSON.stringify(...))`. All interactivity lives in the client component; API routes handle mutations.

### Data model (key tables)
- **`LineItemTemplate`** — recurring budget items. `templateType` = `EXPENSE` or `INCOME`. Income templates don't create `MonthlyEntry` rows; they inform projections and pre-fill income on month setup. `pendingAmount` / `pendingFromMonth` / `pendingFromYear` store a scheduled future amount change that auto-promotes when a new month is opened.
- **`Month`** — one row per calendar month per user. Stores `salaryIncome`, `freelanceIncome`, `otherIncome` as flat fields. `isPopulated` flips to true after entries are auto-created from active templates.
- **`MonthlyEntry`** — instance of an expense template for a specific month (unique on `monthId + templateId`). `statementAmount` tracks next-month CC carry-forward.
- **`AdHocItem`** — one-off income or expense attached to a month.
- **`ChitFund`** — 1:1 with a `LineItemTemplate` of category `CHIT_FUND`; tracks accumulated savings and lift state.

### Category enum
`Category` in `prisma/schema.prisma` covers both expense and income categories. Expense categories: `HOUSE_MAINTENANCE`, `LOAN`, `CHIT_FUND`, `CREDIT_CARD`, `SAVINGS`, `PERSONAL`, `MISCELLANEOUS`. Income categories: `SALARY`, `FREELANCE`, `RENTAL`, `BUSINESS`, `INVESTMENTS`, `OTHER_INCOME`. `EXPENSE_CATEGORIES` and `INCOME_CATEGORIES` arrays in `src/lib/utils.ts` keep them separated in the UI.

### Credit card logic
CC entries work differently from all other categories:
- `statementDay` on the template is the statement close date.
- Ad-hoc CC charges added before the close date bump `entry.amount` (current bill); charges after go into `statementAmount` (next month's bill) via `src/app/api/months/[monthId]/adhoc/route.ts`.
- The dashboard carries `statementAmount` forward: when a new month is opened, the previous month's `statementAmount` becomes the new entry's opening `amount`.

### Year projections (`/months` page)
`src/app/(app)/months/page.tsx` builds the 12-month FY view. Unpopulated months are projected: expense = sum of active monthly templates + yearly templates due that month; income = sum of active income templates (with pending amount promotion applied). The `getProjectedIncome` function respects scheduled income changes. Falls back to last actual month's `salaryIncome` if no income templates exist.

### Auth
NextAuth v5 (beta) with Google OAuth + Prisma adapter. `auth()` is the server-side session accessor. `session.user.role` and `session.user.isActive` are injected via the session callback.

### Key utility functions (`src/lib/utils.ts`)
- `CATEGORY_LABELS` / `CATEGORY_COLORS` — display name and hex color per category key
- `getCategoryDisplay` / `getCategoryColor` — handle custom category overrides
- `EXPENSE_CATEGORIES` / `INCOME_CATEGORIES` — typed arrays for UI chip lists

### DB migrations
The database was originally bootstrapped without Prisma migrations (`db push` only, drift accumulated with no history). It's now baselined — `prisma/migrations/20260813133300_baseline/` represents everything up to that point, marked applied against the real DB via `prisma migrate resolve --applied` (that command only writes a tracking row; it never ran any SQL, so no data or schema changed). From here on:
- Schema changes go through `npm run db:migrate` (`prisma migrate dev`), which generates a reviewable `migration.sql` under `prisma/migrations/` and applies it — review the generated SQL before committing it.
- Apply pending migrations elsewhere (a fresh clone, CI, prod) with `npm run db:migrate:deploy` (`prisma migrate deploy`), which doesn't prompt.
- Don't use `db:push` for real schema changes anymore — it bypasses migration history entirely, which is exactly what baselining was meant to fix. It's still fine for a disposable local experiment you intend to throw away.

### Prisma client limitations
`templateType` is in `schema.prisma` but **not** in the generated client's TypeScript filter/select types (the column exists in DB but the generated `src/generated/prisma/` client predates it). Consequence: never use `templateType` in a Prisma `where` or `select` clause — it will throw `PrismaClientValidationError` at runtime. Always fetch templates without a `select` and filter `t.templateType === "INCOME"` in JavaScript, as done throughout `months/page.tsx`.
