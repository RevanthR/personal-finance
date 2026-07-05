import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function TemplatesLoading() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>

      {/* Full-width tab bar (Income / Expenses) */}
      <div className="grid grid-cols-2 gap-0 rounded-lg border bg-muted p-1">
        <Skeleton className="h-8 rounded-md" />
        <Skeleton className="h-8 rounded-md" />
      </div>

      {/* Category groups */}
      {[0, 1, 2].map(cat => (
        <div key={cat} className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          {[0, 1].map(row => (
            <Card key={row}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-1 h-10 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-8 rounded" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
