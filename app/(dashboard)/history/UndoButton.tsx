'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { undoAudit } from './actions'

export function UndoButton({ logId }: { logId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const router = useRouter()

  function handleUndo() {
    startTransition(async () => {
      const result = await undoAudit(logId)
      if (result.requiresConfirmation) {
        if (!confirm(result.confirmMessage)) return
        const result2 = await undoAudit(logId, true)
        if (result2.error) setError(result2.error)
        else router.refresh()
      } else if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  if (error) return <span className="text-xs text-red-500 max-w-32 truncate">{error}</span>

  return (
    <button
      onClick={handleUndo}
      disabled={isPending}
      className="text-xs text-gray-400 hover:text-navy dark:hover:text-blue-300 transition-colors disabled:opacity-40 shrink-0 whitespace-nowrap"
    >
      {isPending ? '処理中...' : '元に戻す'}
    </button>
  )
}
