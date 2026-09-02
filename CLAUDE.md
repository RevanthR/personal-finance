# CLAUDE.md: FinanceOS (personal-finance)

Guidance for Claude Code working in this repo. See `../CLAUDE.md` (parent workspace) for the
cross-project account map and the standing deployment rule.

@AGENTS.md

No em dash (—) anywhere: chat replies, code comments, commit messages, docs. Use a comma, period,
parentheses, or two sentences.

## What this is

Personal budgeting PWA (single-owner, small number of users). Recurring expense/income templates
drive per-month ledgers; credit-card statement carry-forward, chit funds, and a 12-month FY
projection view sit on top. Web push for reminders.

Deployed to Vercel (project `personal-finance`).

## Stack

- Next.js 16 App Router, PWA
- Prisma 7 + `@prisma/adapter-pg`, Neon PostgreSQL (pooled)
- NextAuth v5 (beta) with Google OAuth + Prisma adapter
- `@google/genai` (Gemini) for AI features
- Tailwind v4
- vitest: partial coverage (see below)

## Commands

```bash
npm run dev                 # dev server, port 3000
npm run build               # prisma generate + next build
npm run lint                # eslint
npm test                    # vitest
npm run db:migrate          # create + apply a migration from schema changes
npm run db:migrate:deploy   # apply pending migrations without prompting (CI/prod)
npm run db:generate         # regenerate Prisma client after schema changes
npm run db:studio           # Prisma Studio
npm run list-users          # scripts/list-users.ts
npm run gen-icons           # scripts/gen-icons.mjs
```

Type-check with `npx tsc --noEmit`. See `DEFERRED.md` for parked work.

## Test coverage

vitest covers the pure functions in `src/lib/finance-utils.ts` and the credit-card status engine in
`src/lib/cards.ts` (`cards.test.ts` — cycle date math and `cardStatus()`). Most other modules are
not covered.

## Architecture

### Route groups
- `src/app/(app)/`: authenticated app pages (dashboard, months, templates, chits, settings). `(app)/layout.tsx` enforces auth.
- `src/app/admin/`: admin-only user management.
- `src/app/api/`: all API routes; every route checks `auth()` from `src/lib/auth.ts`.

### Pages to Components pattern
Server pages (`page.tsx`) do all DB queries via `db` (Prisma singleton in `src/lib/db.ts`), then pass
serialized data to a `*Client` component via `JSON.parse(JSON.stringify(...))`. All interactivity
lives in the client component; API routes handle mutations.

### Data model (key tables)
- **`LineItemTemplate`**: recurring budget items. `templateType` = `EXPENSE` or `INCOME`. Income templates do not create `MonthlyEntry` rows; they inform projections and pre-fill income on month setup. `pendingAmount` / `pendingFromMonth` / `pendingFromYear` store a scheduled future amount change that auto-promotes when a new month is opened.
- **`Month`**: one row per calendar month per user. Stores `salaryIncome`, `freelanceIncome`, `otherIncome` as flat fields. `isPopulated` flips true after entries are auto-created from active templates.
- **`MonthlyEntry`**: instance of an expense template for a specific month (unique on `monthId + templateId`). Credit-card templates do NOT create these (see Credit card logic below); the `statementAmount` / `billedAmount` / `carriedInAmount` / `openingAmount` fields are legacy CC carry-forward, still read for historical months but no longer written.
- **`AdHocItem`**: one-off income or expense attached to a month. `ccTemplateId` tags it as a charge on that card.
- **`CreditCard`**: 1:1 with a `LineItemTemplate` of category `CREDIT_CARD`; holds bank/network/last4.
- **`CardStatement`**: one row per card per closed billing cycle (`cardId + statementDate` unique). Holds the bank-confirmed `statementBalance`, `paidAmount` / `paidInFull` / `paidAt`, `cashback`. The source of truth for what a card owes.
- **`ChitFund`**: 1:1 with a `LineItemTemplate` of category `CHIT_FUND`; tracks accumulated savings and lift state.

### Category enum
`Category` in `prisma/schema.prisma` covers both. Expense: `HOUSE_MAINTENANCE`, `LOAN`, `CHIT_FUND`,
`CREDIT_CARD`, `SAVINGS`, `PERSONAL`, `MISCELLANEOUS`. Income: `SALARY`, `FREELANCE`, `RENTAL`,
`BUSINESS`, `INVESTMENTS`, `OTHER_INCOME`. `EXPENSE_CATEGORIES` / `INCOME_CATEGORIES` arrays in
`src/lib/utils.ts` keep them separated in the UI.

### Credit card logic
Credit cards run on one pure function, `cardStatus()` in `src/lib/cards.ts`, that every screen reads
from. Nothing per-card is stored per-render.
- A CC template creates NO `MonthlyEntry` rows. Charges are plain `AdHocItem` rows tagged with
  `ccTemplateId` (added manually or via the Gmail pipeline).
- `statementDay` on the template is the billing-cycle close day; `dueDateDay` the payment due day.
  All cycle date math is UTC (`Date.UTC()`), to align with stored `AdHocItem.date` values.
- `cardStatus(card, statements, charges, asOf)` derives everything: statement balance (bank-confirmed
  `CardStatement.statementBalance` once set, else a charge-sum estimate), unbilled spends, past due,
  current balance, utilisation, reconciliation. States: `open` → `awaiting` → `confirmed` →
  `paid` / `pastdue`.
- `src/lib/cards-db.ts` wraps it: `getCardsOverview()` (per-card status for the dashboard + /cards),
  `getCardCycleExpenseByMonth()` (CC cost per calendar month, for the Year View), `ensureCurrentStatement()`.
- Confirm a statement: `POST /api/cards/[cardId]/confirm`. Record a payment: `POST /api/cards/[cardId]/pay`.
  A Gmail-detected card bill payment routes to the same pay path via the Sync review screen.
- The old `cc-effects.ts` blended-`MonthlyEntry` engine is gone. Legacy CC `MonthlyEntry` rows from
  before the rework still exist and are read for historical-month dashboards, never written.

### Year projections (`/months`)
`src/app/(app)/months/page.tsx` builds the 12-month FY view. Unpopulated months are projected:
expense = sum of active monthly templates + yearly templates due that month; income = sum of active
income templates (with pending-amount promotion applied). `getProjectedIncome` respects scheduled
income changes. Falls back to the last actual month's `salaryIncome` if no income templates exist.

### Auth
NextAuth v5 (beta), Google OAuth + Prisma adapter. `auth()` is the server-side session accessor.
`session.user.role` and `session.user.isActive` are injected via the session callback.

### Key utilities (`src/lib/utils.ts`)
- `CATEGORY_LABELS` / `CATEGORY_COLORS`: display name and hex color per category key
- `getCategoryDisplay` / `getCategoryColor`: handle custom category overrides
- `EXPENSE_CATEGORIES` / `INCOME_CATEGORIES`: typed arrays for UI chip lists

## Project-specific gotchas

- **DB migrations**: the database was bootstrapped with `db push` only (drift, no history). It is
  now baselined: `prisma/migrations/20260813133300_baseline/` represents everything up to that
  point, marked applied via `prisma migrate resolve --applied` (that command only writes a tracking
  row, it never ran SQL). From here on: schema changes go through `npm run db:migrate` (review the
  generated `migration.sql` before committing); apply elsewhere with `npm run db:migrate:deploy`. Do
  not use `db:push` for real schema changes anymore, it bypasses migration history, which is exactly
  what baselining fixed. Still fine for a disposable local experiment.
- **`templateType` is not in the generated Prisma client's TS types.** The column exists in the DB
  but the generated `src/generated/prisma/` client predates it. Never use `templateType` in a Prisma
  `where` or `select` clause, it throws `PrismaClientValidationError` at runtime. Always fetch
  templates without a `select` and filter `t.templateType === "INCOME"` in JavaScript, as done
  throughout `months/page.tsx`.
- After any `prisma/schema.prisma` change: `npm run db:migrate`, then fully restart `npm run dev`
  (the Prisma client singleton in `src/lib/db.ts` is cached per process).

## Environment

Requires `.env` (not committed):
- `DATABASE_URL`: Neon PostgreSQL (pooled)
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`: Google OAuth
- `AUTH_SECRET`: NextAuth secret
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: Web Push

## Deployment

Personal project.

- **GitHub**: `RevanthR/personal-finance`. Remote uses SSH host alias `github-revanthr`
  (`~/.ssh/config` → key `~/.ssh/id_ed25519_personal`, revanth.rallabandi@gmail.com):
  `git@github-revanthr:RevanthR/personal-finance.git`.
- **Vercel**: project `personal-finance`, team orgId `team_rrXFtxqdcFt5FUqOUGRYSFIo` (Revanth's
  personal Vercel account).
- **Normal deploy**: commit, `git push origin main`, let Vercel auto-build. Verify in the dashboard.
- **Do not run a bare `vercel` command.** The global CLI login on this machine is shared and usually
  logged into a client account. If a manual deploy is genuinely needed, use an account-scoped token:
  `npx vercel@latest deploy --prod --token "$VERCEL_TOKEN" --scope team_rrXFtxqdcFt5FUqOUGRYSFIo`,
  and check `.vercelignore` first so no local-only `.env` value leaks to prod.
- **DB migrations**: Vercel does not run them. After a schema change run `npm run db:migrate:deploy`
  against the production `DATABASE_URL` yourself.
- `npx tsc --noEmit` before every commit.
