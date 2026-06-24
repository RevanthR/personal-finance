import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminUsersClient } from "@/components/admin/admin-users-client";
import { Users, Calendar, Activity } from "lucide-react";

export default async function AdminPage() {
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { months: true } } },
  });

  const totalMonths = users.reduce((s: number, u: typeof users[0]) => s + u._count.months, 0);
  const activeUsers = users.filter((u: typeof users[0]) => u.isActive).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Portal</h1>
        <p className="text-sm text-muted-foreground">Manage users and view platform stats</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-500" />
            <div>
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="text-xs text-muted-foreground">Total Users</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="w-8 h-8 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold">{activeUsers}</p>
              <p className="text-xs text-muted-foreground">Active Users</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{totalMonths}</p>
              <p className="text-xs text-muted-foreground">Total Months Tracked</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <AdminUsersClient users={JSON.parse(JSON.stringify(users))} />
    </div>
  );
}
