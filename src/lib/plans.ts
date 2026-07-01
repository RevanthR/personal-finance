export type PlanType = "FREE" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface Plan {
  id: PlanType;
  label: string;
  price: number;       // INR
  pricePaise: number;  // for Razorpay (paise)
  durationDays: number;
  perMonth: string;    // display string
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "WEEKLY",
    label: "Weekly",
    price: 29,
    pricePaise: 2900,
    durationDays: 7,
    perMonth: "~₹116/mo",
  },
  {
    id: "MONTHLY",
    label: "Monthly",
    price: 99,
    pricePaise: 9900,
    durationDays: 30,
    perMonth: "₹99/mo",
    highlight: true,
  },
  {
    id: "QUARTERLY",
    label: "Quarterly",
    price: 249,
    pricePaise: 24900,
    durationDays: 90,
    perMonth: "₹83/mo",
  },
  {
    id: "YEARLY",
    label: "Yearly",
    price: 799,
    pricePaise: 79900,
    durationDays: 365,
    perMonth: "₹67/mo",
  },
];

export function getPlan(id: PlanType): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isPlanActive(planExpiry: Date | null | undefined): boolean {
  if (!planExpiry) return false;
  return new Date(planExpiry) > new Date();
}

export function isTrialActive(trialEndsAt: Date | string | null | undefined): boolean {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt) > new Date();
}

export function isAccessAllowed(user: { trialEndsAt: Date | string | null | undefined; planExpiry: Date | string | null | undefined }): boolean {
  return isTrialActive(user.trialEndsAt) || isPlanActive(user.planExpiry instanceof Date ? user.planExpiry : user.planExpiry ? new Date(user.planExpiry) : null);
}

export function trialDaysLeft(trialEndsAt: Date | string | null | undefined): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}
