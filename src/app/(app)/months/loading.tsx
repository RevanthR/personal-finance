import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeaderSkeleton } from "@/components/ui/page-header";
import { SummaryCardSkeleton } from "@/components/ui/summary-card";
import { TabsUnderlineSkeleton } from "@/components/ui/tabs-underline";

export default function MonthsLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageHeaderSkeleton className="mb-0" />
      <TabsUnderlineSkeleton count={2} />

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-5">
          <div className="flex flex-col md:flex-row gap-4 items-stretch">
            <SummaryCardSkeleton statCount={3} className="flex-1" />
            <Card className="w-full md:w-64 shrink-0">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-10" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart area */}
          <Skeleton className="h-52 w-full rounded-xl" />

          {/* Monthly grid */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-lg p-2.5 border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-8" />
                    <Skeleton className="h-4 w-6 rounded" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-1 w-full rounded-full" />
                    <Skeleton className="h-1 w-full rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
