import { Skeleton } from '@/components/ui/Skeleton'

export default function ScheduleLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-64" />
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-6 w-24" />
      </div>
      {/* カレンダー格子 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
        <div className="grid grid-cols-6 gap-px">
          {Array.from({ length: 24 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-none" />
          ))}
        </div>
      </div>
    </div>
  )
}
