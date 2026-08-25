import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AdminUsersClient } from "@/components/admin/admin-users-client";
import { Users, Calendar, Activity, CreditCard, Clock, AlertTriangle, Mail, Sparkles, Zap, IndianRupee, UserPlus } from "lucide-react";
import { estimateCostUsd } from "@/lib/gmail/gemini-usage";
import { getInrRate } from "@/lib/gmail/fx-rate";
import { cn } from "@/lib/utils";

export default async function AdminPage() {
  const [users, emailsIngested, geminiByModel, geminiByUser, gmailConnections, monthActivity] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { months: true } } },
    }),
    db.gmailSeenMessage.count(),
    db.geminiUsageLog.groupBy({
      by: ["model"],
      _sum: { batchSize: true, promptTokens: true, candidatesTokens: true, thoughtsTokens: true },
      _count: true,
    }),
    // Per-user slice of the same usage log, for a per-row cost column below
    // instead of only ever seeing one platform-wide total.
    db.geminiUsageLog.groupBy({
      by: ["userId", "model"],
      _sum: { promptTokens: true, candidatesTokens: true, thoughtsTokens: true },
    }),
    db.gmailConnection.findMany({
      select: { userId: true, email: true, connectedAt: true, lastSyncAt: true, needsReauth: true },
    }),
    // AdHocItem has no direct userId FK (only via its Month) — pulling
    // through Month here instead of a raw query, fine at this user count.
    // Doubles as the real "last active" signal: an isActive toggle is a
    // manual admin flag, not evidence anyone's actually using the app.
    db.month.findMany({
      select: { userId: true, adHocItems: { select: { createdAt: true } } },
    }),
  ]);

  // Gemini call/cost tracking only started once GeminiUsageLog shipped —
  // these totals can't be backfilled for emails processed before that.
  const emailsSentToGemini = geminiByModel.reduce((s, g) => s + (g._sum.batchSize ?? 0), 0);
  const geminiCalls = geminiByModel.reduce((s, g) => s + g._count, 0);
  const estimatedSpendUsd = geminiByModel.reduce(
    (s, g) => s + estimateCostUsd(g.model, g._sum.promptTokens ?? 0, g._sum.candidatesTokens ?? 0, g._sum.thoughtsTokens ?? 0),
    0,
  );
  // Same live-rate helper used for foreign-currency transactions elsewhere
  // in the app; falls back to a rough fixed estimate if the lookup fails.
  const usdToInrRate = (await getInrRate("USD")) ?? 87.5;
  const estimatedSpendInr = estimatedSpendUsd * usdToInrRate;

  const gmailByUserId = new Map(gmailConnections.map(g => [g.userId, g]));

  const costUsdByUserId = new Map<string, number>();
  for (const g of geminiByUser) {
    const cost = estimateCostUsd(g.model, g._sum.promptTokens ?? 0, g._sum.candidatesTokens ?? 0, g._sum.thoughtsTokens ?? 0);
    costUsdByUserId.set(g.userId, (costUsdByUserId.get(g.userId) ?? 0) + cost);
  }

  // Deliberately just a timestamp, never an amount — this is a signal for
  // "are they using the app," not a window into what they're spending.
  const lastActiveByUserId = new Map<string, Date>();
  for (const m of monthActivity) {
    for (const item of m.adHocItems) {
      const current = lastActiveByUserId.get(m.userId);
      if (!current || item.createdAt > current) lastActiveByUserId.set(m.userId, item.createdAt);
    }
  }

  const enrichedUsers = users.map(u => ({
    ...u,
    gmail: gmailByUserId.get(u.id) ?? null,
    lastActiveAt: lastActiveByUserId.get(u.id) ?? null,
    syncCostInr: (costUsdByUserId.get(u.id) ?? 0) * usdToInrRate,
  }));

  const pendingSyncRequests = users.filter(u => u.gmailSyncStatus === "REQUESTED").length;

  const now = new Date();
  const totalMonths = users.reduce((s: number, u: typeof users[0]) => s + u._count.months, 0);
  const activeUsers = users.filter((u: typeof users[0]) => u.isActive).length;
  const paidUsers = users.filter((u: typeof users[0]) => u.planExpiry && new Date(u.planExpiry) > now).length;
  const trialUsers = users.filter((u: typeof users[0]) => {
    const hasPlan = u.planExpiry && new Date(u.planExpiry) > now;
    return !hasPlan && u.trialEndsAt && new Date(u.trialEndsAt) > now;
  }).length;
  const expiredUsers = users.filter((u: typeof users[0]) => {
    const hasPlan = u.planExpiry && new Date(u.planExpiry) > now;
    const hasTrial = u.trialEndsAt && new Date(u.trialEndsAt) > now;
    return !hasPlan && !hasTrial;
  }).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Admin" subtitle="Manage users and view platform stats" />

      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <Card>
          <CardContent className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{users.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5">
            <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-positive shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{activeUsers}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{paidUsers}</p>
              <p className="text-xs text-muted-foreground">Paid</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-warning shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{trialUsers}</p>
              <p className="text-xs text-muted-foreground">In Trial</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-negative shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{expiredUsers}</p>
              <p className="text-xs text-muted-foreground">Expired</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{totalMonths}</p>
              <p className="text-xs text-muted-foreground">Months</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <p className="fin-label mb-2">Gmail Sync</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          <Card className={cn(pendingSyncRequests > 0 && "border-primary/40 bg-primary/5")}>
            <CardContent className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5">
              <UserPlus className={cn("w-4 h-4 sm:w-5 sm:h-5 shrink-0", pendingSyncRequests > 0 ? "text-primary" : "text-muted-foreground")} />
              <div>
                <p className="text-lg font-bold tabular-nums">{pendingSyncRequests}</p>
                <p className="text-xs text-muted-foreground">Pending requests</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5">
              <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-lg font-bold tabular-nums">{emailsIngested}</p>
                <p className="text-xs text-muted-foreground">Emails ingested</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
              <div>
                <p className="text-lg font-bold tabular-nums">{emailsSentToGemini}</p>
                <p className="text-xs text-muted-foreground">Sent to Gemini</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-warning shrink-0" />
              <div>
                <p className="text-lg font-bold tabular-nums">{geminiCalls}</p>
                <p className="text-xs text-muted-foreground">Gemini API calls</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5">
              <IndianRupee className="w-4 h-4 sm:w-5 sm:h-5 text-positive shrink-0" />
              <div>
                <p className="text-lg font-bold tabular-nums">₹{estimatedSpendInr.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Est. spend</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AdminUsersClient users={JSON.parse(JSON.stringify(enrichedUsers))} />
    </div>
  );
}
