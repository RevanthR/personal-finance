"use client";

import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentTick } from "@/hooks/use-payment-tick";

interface PaymentDialogProps {
  tick: PaymentTick;
  entryName: string;
  amount: number;
  fmt: (v: number) => string;
}

export function PaymentDialog({ tick, entryName, amount, fmt }: PaymentDialogProps) {
  const {
    isCC, isPartial, paidAmount, outstanding,
    showDialog, setShowDialog, payMode, setPayMode, partialVal, setPartialVal,
    cashbackVal, setCashbackVal, parsedCashback, partialRef, handlePayFull, handleSavePartial,
  } = tick;

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-base">{entryName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Bill amount</span>
              <span className="font-semibold">{fmt(amount)}</span>
            </div>
            {isCC && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-positive">Cashback</span>
                <Input
                  type="number"
                  value={cashbackVal}
                  onChange={e => setCashbackVal(e.target.value)}
                  placeholder="0"
                  className="h-7 w-28 text-right text-sm text-positive border-positive-border focus:border-positive"
                />
              </div>
            )}
            {isCC && parsedCashback() > 0 && (
              <div className="flex items-center justify-between text-sm border-t border-dashed border-border pt-1.5">
                <span className="font-medium">Net payable</span>
                <span className="font-bold">{fmt(amount - parsedCashback())}</span>
              </div>
            )}
            {isPartial && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Already paid</span>
                <span className="text-warning font-semibold">{fmt(paidAmount!)}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 bg-muted rounded-lg p-1">
            <button
              onClick={() => setPayMode("full")}
              className={cn(
                "flex-1 py-3 rounded-md text-sm font-medium transition-colors",
                payMode === "full" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Pay in full
            </button>
            <button
              onClick={() => {
                setPayMode("partial");
                setTimeout(() => partialRef.current?.focus(), 50);
              }}
              className={cn(
                "flex-1 py-3 rounded-md text-sm font-medium transition-colors",
                payMode === "partial" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Partial
            </button>
          </div>

          {payMode === "full" ? (
            <Button className="w-full" onClick={handlePayFull}>
              Mark paid · {fmt(amount - parsedCashback())}
            </Button>
          ) : (
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Amount paying now (₹)</Label>
                <Input
                  ref={partialRef}
                  type="number"
                  value={partialVal}
                  onChange={e => setPartialVal(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSavePartial(); }}
                  placeholder={`up to ${fmt(outstanding)}`}
                  className="mt-1"
                />
              </div>
              <button
                onClick={() => setPartialVal(String(outstanding))}
                className="w-full text-sm text-muted-foreground hover:text-foreground py-3 rounded-lg border border-dashed transition-colors"
              >
                Pay remaining {fmt(outstanding)}
              </button>
              <Button className="w-full" onClick={handleSavePartial}>
                Save partial payment
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
