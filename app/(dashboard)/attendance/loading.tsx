import { Skeleton } from '@/components/ui/Skeleton'

export default function AttendanceLoading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-7 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-5 py-4 flex items-center gap-4">
            <Skeleton className="w-1.5 h-12 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}
