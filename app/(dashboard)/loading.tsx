import { Skeleton, SkeletonCard, SkeletonTable } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-7 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonTable rows={4} />
    </div>
  )
}
