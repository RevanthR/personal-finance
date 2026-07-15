import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AdminUsersClient } from "@/components/admin/admin-users-client";
import { Users, Calendar, Activity, CreditCard, Clock, AlertTriangle } from "lucide-react";

export default async function AdminPage() {
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { months: true } } },
  });

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
      <PageHeader className="mb-0" title="Admin" subtitle="Manage users and view platform stats" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <Users className="w-5 h-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{users.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-positive shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{activeUsers}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <CreditCard className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{paidUsers}</p>
              <p className="text-xs text-muted-foreground">Paid</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-warning shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{trialUsers}</p>
              <p className="text-xs text-muted-foreground">In Trial</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-negative shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{expiredUsers}</p>
              <p className="text-xs text-muted-foreground">Expired</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-lg font-bold tabular-nums">{totalMonths}</p>
              <p className="text-xs text-muted-foreground">Months</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <AdminUsersClient users={JSON.parse(JSON.stringify(users))} />
    </div>
  );
}
