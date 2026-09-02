"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { formatCurrency, cn, MONTHS } from "@/lib/utils";
import { computeCashBalance } from "@/lib/finance-utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryCard } from "@/components/ui/summary-card";
import { TabsUnderline } from "@/components/ui/tabs-underline";
import type { AnalyticsData } from "./stats-breakdown";
import { PageCoach } from "@/components/coach/page-coach";
import { Calendar, LayoutGrid, PieChart } from "lucide-react";

const StatsBreakdown = dynamic(
  () => import("./stats-breakdown").then(m => m.StatsBreakdown),
  { ssr: false, loading: () => <div className="h-64 rounded-lg bg-muted animate-pulse" /> }
);

const YearChart = dynamic(
  () => import("./year-chart").then(m => m.YearChart),
  { ssr: false, loading: () => <div className="h-52 rounded-lg border bg-muted animate-pulse" /> }
);

const CCTrendChart = dynamic(
  () => import("./cc-trend-chart").then(m => m.CCTrendChart),
  { ssr: false, loading: () => <div className="h-44 rounded-lg border bg-muted animate-pulse" /> }
);

function ordinal(n: number) {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// A savings-rate percentage on its own says nothing about whether it's
// good — "15%" needs a reference point. This renders that reference as a
// small ↑/↓-pts line instead of a second bare number.
function SavingsDeltaRow({ label, delta }: { label: string; delta: number | null }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      {delta == null ? (
        <span className="text-muted-foreground">-</span>
      ) : (
        <span className={cn(
          "font-medium",
          delta > 0 ? "text-positive" : delta < 0 ? "text-negative" : "text-muted-foreground"
        )}>
          {delta > 0 ? "↑" : delta < 0 ? "↓" : ""}{Math.abs(delta)} pts
        </span>
      )}
    </div>
  );
}

function RankedList({ items, total }: { items: { name: string; value: number; color?: string; pctOverride?: number }[]; total: number }) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const max = items[0]?.value ?? 1;
  return (
    <div className="space-y-2">
      {items.map(item => {
        // pctOverride (e.g. utilization against a card's own credit limit)
        // takes priority over "share of this list's total" when present.
        const pct = item.pctOverride ?? (total > 0 ? Math.round((item.value / total) * 100) : 0);
        const barPct = item.pctOverride != null ? Math.min(100, item.pctOverride) : (item.value / max) * 100;
        return (
          <div key={item.name}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {item.color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: item.color }} />}
                <span className="text-xs text-foreground truncate">{item.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{pct}%</span>
                <span className="text-xs font-medium">{fmt(item.value)}</span>
              </div>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  item.pctOverride != null && item.pctOverride >= 90 ? "bg-negative" : item.pctOverride != null && item.pctOverride >= 70 ? "bg-warning" : "bg-primary/60"
                )}
                style={{ width: `${barPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type MonthData = {
  id: string | null;
  month: number;
  year: number;
  income: number;
  expenses: number;
  // Cash view for the ending-balance calc below — distinct from `expenses`
  // (committed spend, used for the "saved/deficit" per-month figure and
  // the Expenses tile), since a bill settled via a card doesn't move cash
  // until that card's own bill is paid off. See finance-utils.ts's
  // cashEntryAmount.
  cashExpenses: number;
  ccTotal: number;
  ccByCard: { templateId: string; name: string; amount: number }[];
  balance: number;
  paid: number | null;
  total: number | null;
  isPopulated: boolean;
  isCurrent: boolean;
  hasIncomeChange?: boolean;
  endingTemplateNames?: string[];
  // A loan foreclosure's lump sum, already counted in `expenses`/`balance`
  // above (it's real cash out) — surfaced separately so a one-off payoff
  // can be flagged instead of just looking like a bad month.
  foreclosureAmount?: number;
};

type PastFY = {
  fy: string;
  income: number;
  expenses: number;
  balance: number;
  count: number;
};

type InsightData = {
  categoryBreakdown: { key: string; name: string; value: number; color: string }[];
  ccSubcatBreakdown: { name: string; amount: number }[];
  cardUsage: { name: string; amount: number; creditLimit: number | null }[];
  savingsRate: number;
  totalIncome: number;
  totalExpenses: number;
  upcomingPayments: { name: string; amount: number; dueDay: number; overdue: boolean }[];
} | null;

export function YearOverviewClient({
  months,
  fyKey,
  fyOpeningBalance = 0,
  carriedDebtPaid = 0,
  pastFYSummaries = [],
  currentMonthInsights = null,
  analyticsData,
}: {
  months: MonthData[];
  fyKey: string;
  fyOpeningBalance?: number;
  carriedDebtPaid?: number;
  pastFYSummaries?: PastFY[];
  currentMonthInsights?: InsightData;
  analyticsData?: AnalyticsData;
}) {
  const [tab, setTab] = useState<"overview" | "breakdown">("overview");
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const totalIncome   = months.reduce((s, m) => s + m.income, 0);
  // The "Projected full year" card is a CASH view: opening cash + income −
  // cash out. cashExpenses is the cash-basis monthly spend; carriedDebtPaid
  // is anything paid this year toward an older carried-over bill.
  const totalCashExpenses = months.reduce((s, m) => s + m.cashExpenses, 0);
  const yearEndBalance = computeCashBalance({
    openingBalance: fyOpeningBalance,
    income: totalIncome,
    expense: totalCashExpenses,
    carriedDebtPaid,
  });
  // Shown as the card's own "Cash out" stat, derived so the three numbers
  // bridge exactly: Year-end cash = opening cash + Income − Cash out.
  const totalCashOut = fyOpeningBalance + totalIncome - yearEndBalance;
  const actualCount   = months.filter(m => m.isPopulated).length;
  const projCount     = 12 - actualCount;

  // Real data only, no projected months blended in — "Projected full
  // year" below answers "where will I end up" (a guess); this answers
  // "where do I actually stand right now" (fact).
  const actualMonths = months.filter(m => m.isPopulated);
  const ytdIncome   = actualMonths.reduce((s, m) => s + m.income, 0);
  const ytdExpenses = actualMonths.reduce((s, m) => s + m.expenses, 0);
  const ytdSaved    = ytdIncome - ytdExpenses;

  // The other half of "Year to date" — only the months still ahead,
  // estimated (not yet real). Kept as its own card instead of folding it
  // into "Projected full year" (YTD + this, already shown separately)
  // so "what's still coming" and "where I'll end up overall" don't answer
  // the same question twice.
  const remainingMonths  = months.filter(m => !m.isPopulated);
  const remainingIncome  = remainingMonths.reduce((s, m) => s + m.income, 0);
  const remainingExpenses = remainingMonths.reduce((s, m) => s + m.expenses, 0);
  const remainingSaved   = remainingIncome - remainingExpenses;

  // Savings-rate trend: this month against its own recent history instead
  // of a bare, context-free percentage. Every month in the comparison
  // (this one, last month, and each month behind the FY average) has any
  // loan-foreclosure lump sum excluded first — a deliberate early payoff
  // isn't a spending pattern, and comparing it raw against a normal month
  // would just read as an alarming one-time crash instead of the good
  // move it actually was. The headline "Savings rate (this month)" number
  // itself is untouched by this — only these comparison deltas are.
  const recurringSavingsRate = (m: MonthData): number | null => {
    if (m.income <= 0) return null;
    const recurringExpenses = Math.max(0, m.expenses - (m.foreclosureAmount ?? 0));
    return Math.round(((m.income - recurringExpenses) / m.income) * 100);
  };

  // "vs FY average" excludes the current (in-progress) month from the
  // average it's being compared against — including itself would just be
  // comparing it to a number it's still busy dragging toward.
  const priorActualMonths = actualMonths.filter(m => !m.isCurrent);
  const priorRecurringIncome   = priorActualMonths.reduce((s, m) => s + m.income, 0);
  const priorRecurringExpenses = priorActualMonths.reduce((s, m) => s + Math.max(0, m.expenses - (m.foreclosureAmount ?? 0)), 0);
  const fyAvgSavingsRate = priorRecurringIncome > 0 ? Math.round(((priorRecurringIncome - priorRecurringExpenses) / priorRecurringIncome) * 100) : null;

  const currentIdx = months.findIndex(m => m.isCurrent);
  const lastMonth = currentIdx > 0 ? [...months.slice(0, currentIdx)].reverse().find(m => m.isPopulated) : undefined;
  const lastMonthSavingsRate = lastMonth ? recurringSavingsRate(lastMonth) : null;

  const currentMonthData = months.find(m => m.isCurrent);
  const thisMonthSavingsRate = currentMonthData ? recurringSavingsRate(currentMonthData) : null;
  const vsFyAvgDelta   = thisMonthSavingsRate != null && fyAvgSavingsRate != null ? thisMonthSavingsRate - fyAvgSavingsRate : null;
  const vsLastMonthDelta = thisMonthSavingsRate != null && lastMonthSavingsRate != null ? thisMonthSavingsRate - lastMonthSavingsRate : null;
  const hasForeclosureInComparison = (currentMonthData?.foreclosureAmount ?? 0) > 0 || (lastMonth?.foreclosureAmount ?? 0) > 0
    || priorActualMonths.some(m => (m.foreclosureAmount ?? 0) > 0);

  const maxMonthValue = Math.max(...months.map(m => Math.max(m.income, m.expenses)));

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageCoach
        coachKey="months"
        icon={Calendar}
        iconClass="text-primary"
        bgClass="bg-accent border-primary/20"
        title="Your financial year at a glance"
        desc="April to March. Solid months are real data; dashed months are projections. Tap any past month to see its full breakdown."
      />

      <PageHeader title={fyKey} subtitle={`${actualCount} actual · ${projCount} projected`} />

      <TabsUnderline
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Overview", icon: LayoutGrid },
          { value: "breakdown", label: "Breakdown", icon: PieChart },
        ]}
      />

      {tab === "breakdown" && analyticsData && (
        <StatsBreakdown data={analyticsData} />
      )}

      {tab === "overview" && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 min-w-0 space-y-5">
            {/* Year to date + rest of year side by side (same width each
                that already worked fine before this had a third card
                crammed in) — Projected full year gets its own full-width
                row below, both because it's really just the sum of the
                two above it and because a 3-stat card needs real width or
                the currency values themselves start truncating. */}
            <div className="flex flex-col md:flex-row gap-4 items-stretch">
              <SummaryCard
                className="flex-1"
                tag="Year to date"
                stats={[
                  {
                    label: "Saved so far",
                    value: `${ytdSaved >= 0 ? "+" : "−"}${fmt(Math.abs(ytdSaved))}`,
                    valueClass: ytdSaved >= 0 ? "text-positive" : "text-negative",
                    hint: <span className="text-xs text-muted-foreground">{actualCount} month{actualCount === 1 ? "" : "s"} so far</span>,
                  },
                  { label: "Income", value: fmt(ytdIncome), valueClass: "text-positive" },
                  { label: "Expenses", value: fmt(ytdExpenses), valueClass: "text-negative" },
                ]}
              />

              {projCount > 0 && (
                <SummaryCard
                  className="flex-1"
                  tag="Projected rest of year"
                  stats={[
                    {
                      label: "Projected savings",
                      value: `${remainingSaved >= 0 ? "+" : "−"}${fmt(Math.abs(remainingSaved))}`,
                      valueClass: remainingSaved >= 0 ? "text-positive" : "text-negative",
                      hint: <span className="text-xs text-muted-foreground">{projCount} month{projCount === 1 ? "" : "s"} left</span>,
                    },
                    { label: "Income", value: fmt(remainingIncome), valueClass: "text-positive" },
                    { label: "Expenses", value: fmt(remainingExpenses), valueClass: "text-negative" },
                  ]}
                />
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-stretch">
              <SummaryCard
                className="flex-1"
                tag="Projected full year"
                stats={[
                  {
                    // A cash view: opening cash + Income − Cash out. The two
                    // stats beside it are the cash-basis in/out, so the
                    // three numbers bridge exactly (unlike the accrual
                    // Income/Expenses on the YTD and rest-of-year cards).
                    label: "Year-end cash",
                    value: `${yearEndBalance >= 0 ? "+" : "−"}${fmt(Math.abs(yearEndBalance))}`,
                    valueClass: yearEndBalance >= 0 ? "text-positive" : "text-negative",
                    hint: fyOpeningBalance !== 0
                      ? <span className="text-xs text-muted-foreground">{fyOpeningBalance > 0 ? "+" : "−"}{fmt(Math.abs(fyOpeningBalance))} opening cash</span>
                      : <span className="text-xs text-muted-foreground">cash basis</span>,
                  },
                  { label: "Income", value: fmt(totalIncome), valueClass: "text-positive" },
                  { label: "Cash out", value: fmt(totalCashOut), valueClass: "text-negative" },
                ]}
              />

              {currentMonthInsights && (
                <Card className="w-full md:w-72 shrink-0">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Savings rate (this month)</span>
                      <span className={cn(
                        "text-sm font-bold",
                        currentMonthInsights.savingsRate >= 20 ? "text-positive"
                          : currentMonthInsights.savingsRate >= 0 ? "text-warning"
                          : "text-negative"
                      )}>
                        {currentMonthInsights.savingsRate}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", currentMonthInsights.savingsRate >= 20 ? "bg-positive" : currentMonthInsights.savingsRate >= 0 ? "bg-warning" : "bg-negative")}
                        style={{ width: `${Math.max(0, Math.min(100, currentMonthInsights.savingsRate))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>In: {fmt(currentMonthInsights.totalIncome)}</span>
                      <span>Out: {fmt(currentMonthInsights.totalExpenses)}</span>
                    </div>
                    {/* A rate alone doesn't say whether it's good — these
                        two give it a reference point instead of leaving
                        that to memory. One column, not a side-by-side
                        split — this card is narrow by design (it sits
                        beside another card, not full width), so a second
                        column would squeeze both halves. */}
                    <div className="space-y-1.5 pt-1.5 border-t border-border">
                      <SavingsDeltaRow label="vs last month" delta={vsLastMonthDelta} />
                      <SavingsDeltaRow label="vs your FY average" delta={vsFyAvgDelta} />
                      {hasForeclosureInComparison && (
                        <p className="text-[11px] text-muted-foreground pt-0.5">Excludes loan foreclosures (see FC-tagged months below)</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <YearChart months={months} />
            <CCTrendChart months={months} />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Monthly breakdown
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                {months.map(m => {
                  const incPct = maxMonthValue > 0 ? Math.round((m.income / maxMonthValue) * 100) : 0;
                  const expPct = maxMonthValue > 0 ? Math.round((m.expenses / maxMonthValue) * 100) : 0;

                  const cell = (
                    <div className={cn(
                      "rounded-lg p-2.5 border select-none",
                      m.isCurrent
                        ? "bg-accent border-primary/40 ring-1 ring-primary/20"
                        : m.isPopulated
                          ? "bg-card border-border hover:border-foreground/30 transition-colors cursor-pointer"
                          : "bg-muted/50 border-dashed border-border hover:border-foreground/30 transition-colors cursor-pointer"
                    )}>
                      {/* Month + tag */}
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn(
                          "text-xs font-bold",
                          m.isCurrent ? "text-primary" : "text-foreground"
                        )}>
                          {MONTHS[m.month - 1]}
                        </span>
                        <div className="flex items-center gap-0.5 flex-wrap justify-end">
                          {m.hasIncomeChange && (
                            <span title="A scheduled income change takes effect this month" className="text-xs font-bold text-positive bg-positive-bg px-1 py-0.5 rounded">↑</span>
                          )}
                          {(m.foreclosureAmount ?? 0) > 0 && (
                            <span
                              title={`Includes a ${fmt(m.foreclosureAmount!)} loan foreclosure, a one-off payoff, not regular spend`}
                              className="text-xs font-bold text-primary bg-accent px-1 py-0.5 rounded"
                            >
                              FC
                            </span>
                          )}
                          {(m.endingTemplateNames?.length ?? 0) > 0 && (
                            <span
                              title={m.endingTemplateNames?.join(", ")}
                              className="text-xs font-bold text-negative bg-negative-bg px-1 py-0.5 rounded"
                            >
                              ↓{m.endingTemplateNames!.length}
                            </span>
                          )}
                          {!m.isPopulated && (
                            <span title="Estimated, projected from active recurring items, not yet real transactions" className="text-xs font-medium text-muted-foreground bg-muted px-1 py-0.5 rounded">est</span>
                          )}
                          {m.isPopulated && !m.isCurrent && m.paid !== null && m.total !== null && (
                            <span className={cn(
                              "text-xs font-medium px-1 py-0.5 rounded",
                              m.paid === m.total ? "bg-positive-bg text-positive" : "bg-warning-bg text-warning"
                            )}>
                              {m.paid}/{m.total}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Mini income/expense bars */}
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1 h-1 rounded-full bg-positive shrink-0" />
                          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-positive" style={{ width: `${incPct}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={cn("w-1 h-1 rounded-full shrink-0", expPct > 90 ? "bg-negative" : "bg-warning")} />
                          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", expPct > 90 ? "bg-negative" : "bg-warning")}
                              style={{ width: `${expPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Balance — the sign/color already say saved vs.
                          deficit, so the caption below doesn't repeat that
                          as a word squeezed next to an unrelated second
                          number ("saved · ₹X spent" read as one run-on
                          line). One number per line, each labeled for what
                          it actually is. */}
                      <p className={cn(
                        "text-xs font-bold",
                        m.balance >= 0 ? "text-positive" : "text-negative"
                      )}>
                        {m.balance >= 0 ? "+" : "−"}{fmt(Math.abs(m.balance))}
                      </p>
                      <p className="text-xs mt-0.5 text-muted-foreground">
                        Spent {fmt(m.expenses)}
                      </p>
                    </div>
                  );

                  const href = m.isPopulated && m.id
                    ? `/months/${m.id}`
                    : m.isCurrent
                      ? "/dashboard"
                      : `/dashboard?month=${m.month}&year=${m.year}`;

                  return (
                    <Link key={`${m.year}-${m.month}`} href={href}>{cell}</Link>
                  );
                })}
              </div>
            </div>

            {pastFYSummaries.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Previous years
                </p>
                {pastFYSummaries.map(fy => (
                  <div key={fy.fy} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card">
                    <div>
                      <p className="text-sm font-medium">{fy.fy}</p>
                      <p className="text-xs text-muted-foreground">{fy.count} months</p>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-sm font-bold",
                        fy.balance >= 0 ? "text-positive" : "text-negative"
                      )}>
                        {fy.balance >= 0 ? "+" : "−"}{fmt(Math.abs(fy.balance))}
                      </p>
                      <p className="text-xs text-muted-foreground">{fmt(fy.income)} in</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: current month insights */}
          {currentMonthInsights && (
            <div className="w-full lg:w-80 shrink-0 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                This month
              </p>

              {currentMonthInsights.categoryBreakdown.length > 0 && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold mb-2.5">Top spend</p>
                    <RankedList
                      items={currentMonthInsights.categoryBreakdown}
                      total={currentMonthInsights.totalExpenses}
                    />
                  </CardContent>
                </Card>
              )}

              {currentMonthInsights.ccSubcatBreakdown.length > 0 && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold mb-2.5">Card spend by type</p>
                    <RankedList
                      items={currentMonthInsights.ccSubcatBreakdown.map(i => ({ name: i.name, value: i.amount }))}
                      total={currentMonthInsights.ccSubcatBreakdown.reduce((s, i) => s + i.amount, 0)}
                    />
                  </CardContent>
                </Card>
              )}

              {currentMonthInsights.cardUsage.length > 0 && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold mb-2.5">Card usage</p>
                    <RankedList
                      items={currentMonthInsights.cardUsage.map(i => ({
                        name: i.name,
                        value: i.amount,
                        // % of the card's own credit limit when one's set in
                        // Vault, so this reads as "how maxed out is this
                        // card" — not just "share of this month's CC spend".
                        pctOverride: i.creditLimit ? Math.round((i.amount / i.creditLimit) * 100) : undefined,
                      }))}
                      total={currentMonthInsights.cardUsage.reduce((s, i) => s + i.amount, 0)}
                    />
                  </CardContent>
                </Card>
              )}

              {currentMonthInsights.upcomingPayments.length > 0 && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold mb-2">Upcoming</p>
                    <div className="space-y-1.5">
                      {currentMonthInsights.upcomingPayments.map(p => (
                        <div key={p.name} className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-xs truncate">{p.name}</p>
                            <p className={cn("text-xs", p.overdue ? "text-negative" : "text-muted-foreground")}>
                              {p.overdue ? "overdue" : `due ${ordinal(p.dueDay)}`}
                            </p>
                          </div>
                          <span className="text-xs font-medium shrink-0 ml-2">
                            {fmt(p.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
