import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeaderSkeleton } from "@/components/ui/page-header";
import { SummaryCardSkeleton } from "@/components/ui/summary-card";

// Shared by src/app/(app)/dashboard/loading.tsx and
// src/app/(app)/months/[monthId]/loading.tsx — both routes render
// DashboardClient, so one skeleton kept here (next to dashboard-client.tsx,
// not duplicated per-route) is what stays in sync when that layout
// changes, instead of two copies silently drifting apart.
export function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />

      {/* Month navigation pill + Add button */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center rounded-xl border bg-card overflow-hidden h-10">
          <div className="flex items-center justify-center h-10 px-3">
            <Skeleton className="h-4 w-4" />
          </div>
          <div className="flex-1 flex justify-center">
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex items-center justify-center h-10 px-3">
            <Skeleton className="h-4 w-4" />
          </div>
        </div>
        <Skeleton className="h-10 w-10 rounded-md shrink-0 sm:w-36" />
      </div>

      {/* Overview summary card */}
      <SummaryCardSkeleton statCount={5} />

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>

      {/* Entries + chart panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {Array.from({ length: 4 }).map((_, cat) => (
            <div key={cat} className="relative pl-3">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-muted" />
              <div className="flex items-center justify-between px-2 py-1.5 mb-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="space-y-1.5">
                {Array.from({ length: 2 }).map((_, row) => (
                  <div key={row} className="flex items-center gap-3 px-2 py-2.5 rounded-xl border bg-card">
                    <Skeleton className="w-5 h-5 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-[170px] w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
