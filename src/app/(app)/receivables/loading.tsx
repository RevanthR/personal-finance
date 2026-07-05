import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ReceivablesLoading() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      {/* 3-tab pill selector */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {[72, 56, 88].map((w, i) => (
          <Skeleton key={i} className="h-9 rounded-md" style={{ width: w }} />
        ))}
      </div>

      {/* Card grid (default: Cards tab) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-4 rounded" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-10 w-full rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
