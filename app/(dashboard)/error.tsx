'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex items-center justify-center py-24 px-4">
      <div className="text-center max-w-md">
        <p className="text-4xl mb-4">⚠️</p>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">エラーが発生しました</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          問題が続く場合は、ページを再読み込みするか管理者に連絡してください。
          {error.digest && (
            <span className="block mt-2 text-xs text-gray-400">エラーコード: {error.digest}</span>
          )}
        </p>
        <button
          onClick={reset}
          className="inline-block px-5 py-2.5 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-dark transition-colors"
        >
          もう一度試す
        </button>
      </div>
    </div>
  )
}
