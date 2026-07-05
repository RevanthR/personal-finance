import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      {/* Header: "This Month" label + navigation pill + Add button */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center rounded-xl border bg-muted/40 overflow-hidden h-10">
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
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[0, 1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="px-2.5 py-2 space-y-1.5">
              <div className="flex justify-between items-center">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3.5 w-3.5 rounded" />
              </div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>

      {/* Entries + charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Category groups with accordion-style headers */}
        <div className="lg:col-span-2 space-y-4">
          {[0, 1, 2, 3].map(cat => (
            <div key={cat} className="relative pl-3">
              {/* Left accent strip */}
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-muted" />
              {/* Group header */}
              <div className="flex items-center justify-between px-2 py-1.5 mb-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
        {/* Chart panel */}
        <div>
          <Card>
            <CardContent className="p-4 space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-[170px] w-full rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
