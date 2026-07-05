import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function MonthsLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* FY title + subtitle + tab pills */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex gap-1 bg-zinc-100 rounded-xl p-1 w-fit">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 max-w-5xl lg:items-start">
        <div className="flex-1 min-w-0 space-y-5">
          {/* Year-end projection card */}
          <Card className="border-2 border-emerald-200">
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-9 w-40" />
              <div className="flex gap-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-24" />
              </div>
            </CardContent>
          </Card>

          {/* Chart area */}
          <Skeleton className="h-52 w-full rounded-xl" />

          {/* Monthly grid */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-xl p-2.5 border bg-card space-y-2">
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
