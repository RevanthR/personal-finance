import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ChitsLoading() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>

      {/* 2-col summary cards */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map(i => (
          <Card key={i}>
            <CardContent className="p-4 space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active chits section */}
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2 px-4 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {[0, 1, 2, 3].map(j => (
                    <div key={j} className="space-y-1">
                      <Skeleton className="h-3 w-14" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 flex-1 rounded-md" />
                  <Skeleton className="h-8 flex-1 rounded-md" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
