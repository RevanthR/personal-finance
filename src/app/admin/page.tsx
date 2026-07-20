import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AdminUsersClient } from "@/components/admin/admin-users-client";
import { Users, Calendar, Activity, CreditCard, Clock, AlertTriangle, Mail, Sparkles, Zap, IndianRupee } from "lucide-react";
import { estimateCostUsd } from "@/lib/gmail/gemini-usage";
import { getInrRate } from "@/lib/gmail/fx-rate";

export default async function AdminPage() {
  const [users, emailsIngested, geminiByModel] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { months: true } } },
    }),
    db.gmailSeenMessage.count(),
    db.geminiUsageLog.groupBy({
      by: ["model"],
      _sum: { batchSize: true, promptTokens: true, candidatesTokens: true },
      _count: true,
    }),
  ]);

  // Gemini call/cost tracking only started once GeminiUsageLog shipped —
  // these totals can't be backfilled for emails processed before that.
  const emailsSentToGemini = geminiByModel.reduce((s, g) => s + (g._sum.batchSize ?? 0), 0);
  const geminiCalls = geminiByModel.reduce((s, g) => s + g._count, 0);
  const estimatedSpendUsd = geminiByModel.reduce(
    (s, g) => s + estimateCostUsd(g.model, g._sum.promptTokens ?? 0, g._sum.candidatesTokens ?? 0),
    0,
  );
  // Same live-rate helper used for foreign-currency transactions elsewhere
  // in the app; falls back to a rough fixed estimate if the lookup fails.
  const usdToInrRate = (await getInrRate("USD")) ?? 87.5;
  const estimatedSpendInr = estimatedSpendUsd * usdToInrRate;

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
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

      <AdminUsersClient users={JSON.parse(JSON.stringify(users))} />
    </div>
  );
}
