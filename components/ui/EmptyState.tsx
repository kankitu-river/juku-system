import Link from 'next/link'

interface EmptyStateProps {
  message: string
  actionLabel?: string
  actionHref?: string
}

export function EmptyState({ message, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <p className="text-sm text-gray-400">{message}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="px-4 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-light transition-colors"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
