import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function TemplatesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      {[0, 1, 2].map(cat => (
        <div key={cat} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          {[0, 1, 2].map(row => (
            <Card key={row}>
              <CardContent className="p-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-full w-0.5 rounded-full self-stretch" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-6 rounded" />
                  <div className="flex gap-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
