import { Skeleton } from '@/components/ui/skeleton';

export function RequestDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-48 mt-2" />
        </div>
        <div className="card p-5 space-y-3">
          <Skeleton className="h-5 w-48" />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-7 w-7 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="card p-5 space-y-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

export function PendingRequestsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card p-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EngagementLetterSkeleton() {
  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-7 w-7 rounded-full" />
        ))}
      </div>
      <div className="card p-5 space-y-4">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    </div>
  );
}

export function TemplateLibrarySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 4].map((i) => (
        <div key={i} className="card p-4 flex justify-between gap-4">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
