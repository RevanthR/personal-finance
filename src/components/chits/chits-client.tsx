"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { AddChitDialog } from "./add-chit-dialog";
import { LiftChitDialog } from "./lift-chit-dialog";
import { format } from "date-fns";

type Chit = {
  id: string;
  totalValue: number;
  durationMonths: number;
  startDate: string;
  monthlyUnliftedAmount: number;
  monthlyLiftedAmount: number | null;
  isLifted: boolean;
  liftedOn: string | null;
  liftedAmount: number | null;
  liftedUsedFor: string | null;
  accumulatedSavings: number;
  endDate: string | null;
  template: { id: string; name: string; isActive: boolean };
};

interface ChitsClientProps {
  chits: Chit[];
}

export function ChitsClient({ chits: initialChits }: ChitsClientProps) {
  const { hidden } = usePrivacy();
  const fmt = (v: number) => hidden ? "••••" : formatCurrency(v);
  const [chits, setChits] = useState(initialChits);
  const [showAdd, setShowAdd] = useState(false);
  const [liftingChit, setLiftingChit] = useState<Chit | null>(null);

  const activeChits = chits.filter((c) => !c.isLifted && c.template.isActive);
  const liftedChits = chits.filter((c) => c.isLifted);
  const totalSavings = activeChits.reduce((s, c) => s + c.accumulatedSavings, 0);

  async function handleAdd(data: {
    name: string;
    totalValue: number;
    durationMonths: number;
    startDate: string;
    monthlyUnliftedAmount: number;
    monthlyLiftedAmount?: number;
    dueDateDay?: number;
  }) {
    const res = await fetch("/api/chits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { toast.error("Failed to add chit"); return; }
    const newChit = await res.json();
    setChits((prev) => [...prev, newChit]);
    toast.success("Chit fund added");
    setShowAdd(false);
  }

  async function handleLift(chitId: string, data: {
    liftedAmount: number;
    liftedUsedFor: string;
    monthlyLiftedAmount: number;
  }) {
    const res = await fetch(`/api/chits/${chitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLifted: true, ...data }),
    });
    if (!res.ok) { toast.error("Failed to lift chit"); return; }
    const updated = await res.json();
    setChits((prev) => prev.map((c) => c.id === chitId ? updated : c));
    toast.success("Chit marked as lifted");
    setLiftingChit(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chit Funds</h1>
          <p className="text-sm text-muted-foreground">
            {activeChits.length} active · {fmt(totalSavings)} saved up
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Chit
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Active Chits</p>
            <p className="text-2xl font-bold">{activeChits.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Monthly Commitment</p>
            <p className="text-2xl font-bold">
              {fmt(activeChits.reduce((s, c) => s + c.monthlyUnliftedAmount, 0))}
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Savings Accumulated</p>
            <p className="text-2xl font-bold text-green-600">{fmt(totalSavings)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Active chits */}
      {activeChits.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Active Chits
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {activeChits.map((chit) => {
              const progressPercent = Math.min(
                100,
                Math.round((chit.accumulatedSavings / chit.totalValue) * 100)
              );
              return (
                <Card key={chit.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{chit.template.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        Saving
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Value</p>
                        <p className="font-semibold">{fmt(chit.totalValue)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Monthly</p>
                        <p className="font-semibold">{fmt(chit.monthlyUnliftedAmount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Started</p>
                        <p className="font-semibold">{format(new Date(chit.startDate), "MMM yyyy")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Duration</p>
                        <p className="font-semibold">{chit.durationMonths} months</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Accumulated savings</span>
                        <span className="font-medium text-green-600">
                          {fmt(chit.accumulatedSavings)} ({progressPercent}%)
                        </span>
                      </div>
                      <Progress value={progressPercent} className="h-1.5" />
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setLiftingChit(chit)}
                    >
                      Mark as Lifted
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Lifted chits */}
      {liftedChits.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Lifted Chits
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {liftedChits.map((chit) => (
              <Card key={chit.id} className="opacity-80">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{chit.template.name}</CardTitle>
                    <Badge variant="destructive" className="text-xs">
                      <TrendingDown className="w-3 h-3 mr-1" />
                      Lifted
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Lifted Amount</p>
                      <p className="font-semibold">{fmt(chit.liftedAmount ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Lifted On</p>
                      <p className="font-semibold">
                        {chit.liftedOn ? format(new Date(chit.liftedOn), "MMM yyyy") : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Monthly (now)</p>
                      <p className="font-semibold">{fmt(chit.monthlyLiftedAmount ?? 0)}</p>
                    </div>
                  </div>
                  {chit.liftedUsedFor && (
                    <p className="text-xs text-muted-foreground bg-muted rounded p-2">
                      Used for: {chit.liftedUsedFor}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {chits.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
          <p>No chit funds yet. Add your first one!</p>
        </div>
      )}

      <AddChitDialog open={showAdd} onOpenChange={setShowAdd} onAdd={handleAdd} />
      {liftingChit && (
        <LiftChitDialog
          open={!!liftingChit}
          onOpenChange={(o) => !o && setLiftingChit(null)}
          chit={liftingChit}
          onLift={(data) => handleLift(liftingChit.id, data)}
        />
      )}
    </div>
  );
}
