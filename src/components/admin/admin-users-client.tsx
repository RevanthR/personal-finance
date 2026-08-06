"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { cn, formatCurrency } from "@/lib/utils";

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
  trialEndsAt: string | null;
  gmailSyncStatus: "NONE" | "REQUESTED" | "APPROVED";
  gmail: { email: string | null; connectedAt: string; lastSyncAt: string | null; needsReauth: boolean } | null;
  lastActiveAt: string | null;
  lifetimeSpend: number;
  syncCostInr: number;
  _count: { months: number };
};

function GmailStatusCell({ user, onApprove }: { user: User; onApprove: () => void }) {
  if (user.gmail) {
    return user.gmail.needsReauth ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
        <AlertTriangle className="w-3 h-3" /> Needs reauth
      </span>
    ) : (
      <span className="text-xs font-medium text-positive">Connected</span>
    );
  }
  if (user.gmailSyncStatus === "REQUESTED") {
    return (
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onApprove}>
        Approve request
      </Button>
    );
  }
  if (user.gmailSyncStatus === "APPROVED") {
    return <span className="text-xs text-muted-foreground">Approved, not connected</span>;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function PlanBadge({ planType, planExpiry, trialEndsAt }: { planType: string; planExpiry: string | null; trialEndsAt: string | null }) {
  const now = new Date();
  const expiry = planExpiry ? new Date(planExpiry) : null;
  const trial = trialEndsAt ? new Date(trialEndsAt) : null;
  const isPaid = expiry && expiry > now;
  const isInTrial = !isPaid && trial && trial > now;

  if (isPaid) {
    const daysLeft = Math.ceil((expiry!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isExpiringSoon = daysLeft <= 3;
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className={cn(
          "inline-flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-full",
          isExpiringSoon ? "bg-warning-bg text-warning" : "bg-positive-bg text-positive"
        )}>
          {planType}
        </span>
        <span className="text-xs text-muted-foreground">
          {isExpiringSoon ? `${daysLeft}d left` : `till ${format(expiry!, "dd MMM")}`}
        </span>
      </div>
    );
  }

  if (isInTrial) {
    const daysLeft = Math.ceil((trial!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-full bg-accent text-primary">
          TRIAL
        </span>
        <span className="text-xs text-muted-foreground">
          {daysLeft === 0 ? "expires today" : `${daysLeft}d left`}
        </span>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-full bg-negative-bg text-negative">
      EXPIRED
    </span>
  );
}

export function AdminUsersClient({ users: initial }: { users: User[] }) {
  const [users, setUsers] = useState(initial);

  async function updateUser(userId: string, updates: { role?: string; isActive?: boolean; gmailSyncStatus?: "NONE" | "REQUESTED" | "APPROVED" }) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...updates }),
    });
    if (!res.ok) { toast.error("Failed to update"); return; }
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...updates } : u));
    toast.success("User updated");
  }

  async function approveSync(userId: string, name: string | null) {
    await updateUser(userId, { gmailSyncStatus: "APPROVED" });
    toast.message(`Reminder: add ${name ?? "this user"}'s email as a test user in Google Cloud Console too — approving here alone doesn't let them past Google's own consent screen.`);
  }

  return (
    <DataTable
      rows={users}
      rowKey={(user) => user.id}
      leadingHeader="User"
      leading={(user) => {
        const initials = user.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "U";
        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarImage src={user.image ?? undefined} />
              <AvatarFallback className="bg-foreground text-background text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium truncate">{user.name}</p>
                {user.role === "ADMIN" && <Badge className="text-xs shrink-0">Admin</Badge>}
              </div>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        );
      }}
      columns={[
        {
          key: "plan",
          header: "Plan",
          align: "right",
          render: (user) => <PlanBadge planType={user.planType} planExpiry={user.planExpiry} trialEndsAt={user.trialEndsAt} />,
        },
        {
          key: "lastActive",
          header: "Last active",
          align: "right",
          render: (user) => user.lastActiveAt
            ? <span title={format(new Date(user.lastActiveAt), "dd MMM yyyy, h:mm a")}>{formatDistanceToNow(new Date(user.lastActiveAt), { addSuffix: true })}</span>
            : <span className="text-muted-foreground">Never</span>,
        },
        {
          key: "gmail",
          header: "Gmail",
          align: "right",
          render: (user) => <GmailStatusCell user={user} onApprove={() => approveSync(user.id, user.name)} />,
        },
        {
          key: "months",
          header: "Months",
          align: "right",
          hideOnMobile: true,
          render: (user) => user._count.months,
        },
        {
          key: "spend",
          header: "Lifetime spend",
          align: "right",
          hideOnMobile: true,
          render: (user) => formatCurrency(user.lifetimeSpend),
        },
        {
          key: "syncCost",
          header: "Sync cost",
          align: "right",
          hideOnMobile: true,
          render: (user) => user.syncCostInr > 0 ? `₹${user.syncCostInr.toFixed(2)}` : "—",
        },
        {
          key: "joined",
          header: "Joined",
          align: "right",
          hideOnMobile: true,
          render: (user) => format(new Date(user.createdAt), "dd MMM yyyy"),
        },
      ]}
      trailing={(user) => (
        <div className="flex items-center gap-3">
          <Switch
            checked={user.isActive}
            onCheckedChange={(v) => updateUser(user.id, { isActive: v })}
          />
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 px-2"
            onClick={() => updateUser(user.id, { role: user.role !== "ADMIN" ? "ADMIN" : "USER" })}
          >
            {user.role !== "ADMIN" ? "Make Admin" : "Remove Admin"}
          </Button>
        </div>
      )}
    />
  );
}
