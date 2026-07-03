import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton'

export default function ShiftsLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-32 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <SkeletonTable rows={7} />
    </div>
  )
}
