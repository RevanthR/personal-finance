// Canonical client-side shape of an AdHocItem row, as selected across
// dashboard/page.tsx, months/[monthId]/page.tsx, and returned by
// src/app/api/months/[monthId]/adhoc/route.ts and
// src/app/api/gmail/parsed/[id]/route.ts. Every dashboard component that
// touches an ad-hoc item imports this instead of redeclaring its own copy —
// before this existed, the same shape was hand-typed independently in five
// different files, which is how isCredit silently went missing from one of
// them (a manual cache-sync literal in dashboard-client.tsx) until this
// session's isCardRepayment work happened to touch it too. A component that
// only needs some fields (e.g. daily-spend-chart.tsx never reads name/notes)
// should narrow with Pick<AdHocItem, ...> rather than re-declaring its own
// independent type.
export type AdHocItem = {
  id: string;
  name: string;
  amount: number;
  type: string;
  category: string | null;
  customCategory: string | null;
  customCategoryId: string | null;
  subCategory: string | null;
  date: string;
  notes: string | null;
  ccTemplateId: string | null;
  isCredit?: boolean;
  isCardRepayment?: boolean;
};
