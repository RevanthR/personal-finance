"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";

type User = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  planType: string;
  planExpiry: string | null;
  _count: { months: number };
};

function PlanBadge({ planType, planExpiry }: { planType: string; planExpiry: string | null }) {
  const now = new Date();
  const expiry = planExpiry ? new Date(planExpiry) : null;
  const isActive = expiry && expiry > now;

  if (!isActive || planType === "FREE") {
    return (
      <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
        FREE
      </span>
    );
  }

  const daysLeft = Math.ceil((expiry!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isExpiringSoon = daysLeft <= 3;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isExpiringSoon ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
        {planType}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {isExpiringSoon ? `${daysLeft}d left` : `till ${format(expiry!, "dd MMM")}`}
      </span>
    </div>
  );
}

export function AdminUsersClient({ users: initial }: { users: User[] }) {
  const [users, setUsers] = useState(initial);

  async function updateUser(userId: string, updates: { role?: string; isActive?: boolean }) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...updates }),
    });
    if (!res.ok) { toast.error("Failed to update"); return; }
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...updates } : u));
    toast.success("User updated");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Users</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {users.map((user) => {
            const initials = user.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "U";
            return (
              <div
                key={user.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card"
              >
                <Avatar className="w-10 h-10">
                  <AvatarImage src={user.image ?? undefined} />
                  <AvatarFallback className="bg-zinc-900 text-white text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{user.name}</p>
                    <Badge variant={user.role === "ADMIN" ? "default" : "secondary"} className="text-xs">
                      {user.role}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {user._count.months} months · joined {format(new Date(user.createdAt), "dd MMM yyyy")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <PlanBadge planType={user.planType} planExpiry={user.planExpiry} />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Active</span>
                    <Switch
                      checked={user.isActive}
                      onCheckedChange={(v) => updateUser(user.id, { isActive: v })}
                    />
                  </div>
                  {user.role !== "ADMIN" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 px-2"
                      onClick={() => updateUser(user.id, { role: "ADMIN" })}
                    >
                      Make Admin
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 px-2"
                      onClick={() => updateUser(user.id, { role: "USER" })}
                    >
                      Remove Admin
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
