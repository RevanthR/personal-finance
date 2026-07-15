import { DashboardLoadingSkeleton } from "@/components/dashboard/dashboard-loading-skeleton";

// This route renders the same DashboardClient as /dashboard — one shared
// skeleton (see dashboard-loading-skeleton.tsx) instead of a second copy
// that would drift out of sync independently.
export default function MonthDetailLoading() {
  return <DashboardLoadingSkeleton />;
}
