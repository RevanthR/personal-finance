import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Portal</h1>
        <p className="text-sm text-muted-foreground">Manage users and view platform stats</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-7 h-7 text-zinc-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="w-7 h-7 text-green-600 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{activeUsers}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="w-7 h-7 text-indigo-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{paidUsers}</p>
              <p className="text-xs text-muted-foreground">Paid</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-7 h-7 text-blue-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{trialUsers}</p>
              <p className="text-xs text-muted-foreground">In Trial</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-7 h-7 text-red-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{expiredUsers}</p>
              <p className="text-xs text-muted-foreground">Expired</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="w-7 h-7 text-amber-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{totalMonths}</p>
              <p className="text-xs text-muted-foreground">Months</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <AdminUsersClient users={JSON.parse(JSON.stringify(users))} />
    </div>
  );
}
