"use client";

import { useRef, useState } from "react";
import { computeLoanAmortization } from "@/lib/loan-utils";

// Partial payment doesn't carry forward for these categories
const NO_PARTIAL = new Set(["LOAN", "CHIT_FUND"]);

export interface PaymentTickEntry {
  id: string;
  amount: number;
  isPaid: boolean;
  paidAmount: number | null;
  cashbackAmount: number | null;
  template: {
    category: string;
    loanInterestRate: number | null;
    loanRateType: string | null;
    loanOriginalPrincipal: number | null;
    loanStartDate: string | null;
    loanOutstandingOverride: number | null;
  };
}

export type PaymentTickUpdate = (id: string, updates: { isPaid?: boolean; amount?: number; notes?: string; paidAmount?: number; cashbackAmount?: number }) => Promise<void>;

export interface LoanPaidSnapshot {
  emi: number;
  principalThisMonth: number;
  interestThisMonth: number;
  outstandingBefore: number;
  outstandingAfter: number;
  totalInterestRemaining: number;
  monthsRemaining: number;
}

// Shared tick-to-pay behavior: tap to mark paid (opens a full/partial +
// cashback dialog for categories that support it), tap again to unmark.
// One instance must be shared by every UI surface that can tick the same
// entry (e.g. a CC card's collapsed header AND its expanded row) so they
// don't drift out of sync with each other.
export function usePaymentTick(entry: PaymentTickEntry, onUpdate: PaymentTickUpdate) {
  const [optimisticPaid, setOptimisticPaid] = useState(entry.isPaid);
  const [optimisticPaidAmount, setOptimisticPaidAmount] = useState(entry.paidAmount);
  const [optimisticCashback, setOptimisticCashback] = useState(entry.cashbackAmount);

  const [showDialog, setShowDialog] = useState(false);
  const [payMode, setPayMode] = useState<"full" | "partial">("full");
  const [partialVal, setPartialVal] = useState("");
  const [cashbackVal, setCashbackVal] = useState("");
  const partialRef = useRef<HTMLInputElement>(null);

  const [loanPaidSnapshot, setLoanPaidSnapshot] = useState<LoanPaidSnapshot | null>(null);

  const isPaid = optimisticPaid;
  const paidAmount = optimisticPaidAmount;
  const cashback = optimisticCashback ?? 0;
  const isCC = entry.template.category === "CREDIT_CARD";
  const netBill = entry.amount - cashback;
  const isPartial = !isPaid && paidAmount != null && paidAmount > 0;
  const outstanding = netBill - (paidAmount ?? 0);
  const canPartial = !NO_PARTIAL.has(entry.template.category);
  const isLoan = entry.template.category === "LOAN";
  const loanAmort = isLoan && entry.template.loanInterestRate != null ? computeLoanAmortization({
    emi: entry.amount,
    annualRate: entry.template.loanInterestRate,
    originalPrincipal: entry.template.loanOriginalPrincipal,
    startDate: entry.template.loanStartDate,
    outstandingOverride: entry.template.loanOutstandingOverride,
    isPaidThisMonth: isPaid,
  }) : null;

  function handleTickClick() {
    if (isPaid) {
      setOptimisticPaid(false);
      setOptimisticPaidAmount(null);
      onUpdate(entry.id, { isPaid: false });
      return;
    }
    if (!canPartial) {
      setOptimisticPaid(true);
      setOptimisticPaidAmount(null);
      onUpdate(entry.id, { isPaid: true });
      if (isLoan && loanAmort) {
        setLoanPaidSnapshot({
          emi: entry.amount,
          principalThisMonth: loanAmort.principalThisMonth,
          interestThisMonth: loanAmort.interestThisMonth,
          outstandingBefore: loanAmort.outstandingPrincipal,
          outstandingAfter: Math.max(0, loanAmort.outstandingPrincipal - loanAmort.principalThisMonth),
          totalInterestRemaining: Math.max(0, loanAmort.totalInterestRemaining - loanAmort.interestThisMonth),
          monthsRemaining: Math.max(0, loanAmort.monthsRemaining - 1),
        });
      }
      return;
    }
    setPayMode("full");
    setPartialVal(paidAmount != null ? String(outstanding) : "");
    setCashbackVal(cashback > 0 ? String(cashback) : "");
    setShowDialog(true);
  }

  function parsedCashback() {
    const n = parseFloat(cashbackVal);
    return isNaN(n) || n <= 0 ? 0 : Math.min(n, entry.amount);
  }

  async function handlePayFull() {
    const cb = parsedCashback();
    setOptimisticPaid(true);
    setOptimisticPaidAmount(null);
    setOptimisticCashback(cb > 0 ? cb : null);
    setShowDialog(false);
    await onUpdate(entry.id, { isPaid: true, ...(isCC && { cashbackAmount: cb }) });
  }

  async function handleSavePartial() {
    const num = parseFloat(partialVal);
    if (isNaN(num) || num < 0) return;
    const cb = parsedCashback();
    const netAmt = entry.amount - cb;
    if (num >= netAmt) {
      setOptimisticPaid(true);
      setOptimisticPaidAmount(num > netAmt ? num : null);
    } else {
      setOptimisticPaidAmount(num > 0 ? num : null);
    }
    setOptimisticCashback(cb > 0 ? cb : null);
    setShowDialog(false);
    await onUpdate(entry.id, { paidAmount: num, ...(isCC && { cashbackAmount: cb }) });
  }

  return {
    isPaid, paidAmount, cashback, isCC, netBill, isPartial, outstanding, canPartial, isLoan, loanAmort,
    showDialog, setShowDialog, payMode, setPayMode, partialVal, setPartialVal, cashbackVal, setCashbackVal, partialRef,
    handleTickClick, parsedCashback, handlePayFull, handleSavePartial,
    loanPaidSnapshot, setLoanPaidSnapshot,
  };
}

export type PaymentTick = ReturnType<typeof usePaymentTick>;
