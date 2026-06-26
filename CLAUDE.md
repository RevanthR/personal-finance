# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # start dev server (port 3000)
npm run build        # prisma generate + next build
npm run lint         # eslint

npm run db:push      # push schema changes to DB (use instead of migrate dev — the DB has drift)
npm run db:generate  # regenerate Prisma client after schema changes
npm run db:studio    # open Prisma Studio
```

No test suite exists. Type-check with `npx tsc --noEmit`.

## Environment

Requires `.env` (not committed):
- `DATABASE_URL` — Neon PostgreSQL connection string (pooled)
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth
- `AUTH_SECRET` — NextAuth secret
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web Push

## Architecture

**Next.js 16 App Router** PWA — no tests, deployed to Vercel.

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
The database was bootstrapped without Prisma migrations (drift exists). Always use `npm run db:push` to apply schema changes, then `npm run db:generate` to update the client. Never use `prisma migrate dev` — it will offer to reset the DB.

### Prisma client limitations
`templateType` is in `schema.prisma` but **not** in the generated client's TypeScript filter/select types (the column exists in DB but the generated `src/generated/prisma/` client predates it). Consequence: never use `templateType` in a Prisma `where` or `select` clause — it will throw `PrismaClientValidationError` at runtime. Always fetch templates without a `select` and filter `t.templateType === "INCOME"` in JavaScript, as done throughout `months/page.tsx`.
