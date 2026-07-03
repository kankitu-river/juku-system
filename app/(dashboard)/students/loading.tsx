import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton'

export default function StudentsLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-32 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <SkeletonTable rows={8} />
    </div>
  )
}
