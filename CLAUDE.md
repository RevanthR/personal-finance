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

vitest covers the pure functions in `src/lib/finance-utils.ts`, `src/lib/utils.ts` (including the
India-time date helpers), the cash ledger maths in `src/lib/cash-balance.ts`, and the credit-card
engine in `src/lib/cards.ts` (`cards.test.ts`: cycle date math, `cardStatus()`, `cardBillForMonth()`,
repayments and payment allocation). API routes and React components are not covered.

## Architecture

### Route groups
- `src/app/(app)/`: authenticated app pages (dashboard, months, templates, chits, settings). `(app)/layout.tsx` enforces auth and the plan gate (expired users go to `/pricing`).
- `src/app/admin/`: admin-only user management.
- `src/app/api/`: all API routes. Every user route starts with `requireApiUser()` from `src/lib/api-auth.ts` (signed in, active, and on a trial or paid plan; billing, push, account and Gmail-disconnect routes pass `allowExpired`). Cron and webhook routes check their own secret. Gmail sync itself skips inactive or expired accounts, so webhook and cron runs don't spend Gemini quota on them.

### Dates and time zone
The server runs in UTC (Vercel, which does not allow setting `TZ`); users are in India. Any "what
month/day is it" or "which month does this date belong to" question on the server must use the
helpers in `src/lib/utils.ts`: `getCurrentMonthYear()`, `todayDayOfMonth()`, `monthYearOf(date)`,
`localDateString()`. Never `new Date().getMonth()` in server code. Card cycle maths stays in UTC
(`Date.UTC`) to line up with stored date-only values.

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
- `cardLedger()` builds every closed cycle (oldest first): gross (bank figure once confirmed, else
  the charge-sum estimate), recorded payments, card repayments applied, cashback, outstanding.
  `cardStatus()` and `cardBillForMonth()` both read from it, so every screen agrees. States:
  `open`, `awaiting`, `confirmed`, `paid`, `pastdue`. "Paid" is computed from what is outstanding,
  never from the stored `paidInFull` flag (that flag is informational only).
- Older cycles with no `CardStatement` row are assumed settled outside the app; only rows and the
  latest closed cycle can be past due.
- Two ways a card bill gets paid, both landing in the same ledger:
  1. The Pay button or a Gmail "settle": `recordCardPayment()` in `cards-db.ts` writes
     `CardStatement.paidAmount` (oldest unpaid statement first) plus a `CashPayment` row.
  2. A card repayment logged as a transaction (`AdHocItem` with `isCardRepayment`): applied by the
     ledger to the statement current when it was paid, then older unpaid ones, then later ones;
     cash counts it as a one-off outflow. It is NOT a refund and never reduces a cycle's spend.
  Recording the same payment both ways double counts it.
- `src/lib/cards-db.ts`: `getCardsOverview()` (status + cycles for the dashboard and /cards),
  `getCardBillsByMonth()` (card cost per calendar month), `recordCardPayment()`,
  `getOrCreateLatestStatement()`, `rekeyCardStatements()` (run when a card's statement or due day
  changes, so statements stay attached to their cycle).
- Confirm a statement: `POST /api/cards/[cardId]/confirm`. Record a payment: `POST /api/cards/[cardId]/pay`.
- A non-card bill paid with a card (`MonthlyEntry.paidViaCardTemplateId`) also creates a card charge
  (`src/lib/bill-via-card.ts`). Every expense total counts it once, via the card, and skips the entry
  (`effectiveEntryAmount()` returns 0 for it).
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
- **`templateType`** is in the schema and the generated client now. Older code still fetches
  templates without a `select` and filters `t.templateType === "INCOME"` in JavaScript; that is fine
  to keep, but it is no longer required.
- **Deleting a recurring item** with any payment history archives it (`isActive: false`) instead
  of deleting, because a hard delete cascades to past entries and their `CashPayment` rows and
  rewrites old months and the cash balance.
- After any `prisma/schema.prisma` change: `npm run db:migrate`, then fully restart `npm run dev`
  (the Prisma client singleton in `src/lib/db.ts` is cached per process).

## Environment

Requires `.env` (not committed):
- `DATABASE_URL`: Neon PostgreSQL (pooled)
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`: Google OAuth
- `AUTH_SECRET`: NextAuth secret
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (a `mailto:` URL): Web Push. All three are required, missing any one silently disables every push notification (`initVapid` logs a one-time error).
- `GEMINI_API_KEY`: Gmail transaction extraction
- `GMAIL_WEBHOOK_SECRET` / `GMAIL_PUBSUB_TOPIC`: Gmail push (Pub/Sub) sync
- `CRON_SECRET`: authorizes the Vercel Cron routes

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
