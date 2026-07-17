'use client'

import { useState, useEffect, useTransition } from 'react'
import { undoAudit } from '@/app/(dashboard)/history/actions'

interface UndoToastProps {
  auditLogId: string
  message: string
  onUndo: () => void
  onDismiss: () => void
}

export function UndoToast({ auditLogId, message, onUndo, onDismiss }: UndoToastProps) {
  const [isPending, startTransition] = useTransition()
  const [toastError, setToastError] = useState<string>()

  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  function handleUndo() {
    startTransition(async () => {
      const result = await undoAudit(auditLogId)
      if (result.requiresConfirmation) {
        if (!confirm(result.confirmMessage)) return
        const result2 = await undoAudit(auditLogId, true)
        if (result2.error) setToastError(result2.error)
        else onUndo()
      } else if (result.error) {
        setToastError(result.error)
      } else {
        onUndo()
      }
    })
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-xl px-4 py-3 shadow-xl flex items-center gap-4 min-w-72 max-w-md">
      <p className="text-sm flex-1 truncate">{toastError ?? message}</p>
      {!toastError && (
        <button
          onClick={handleUndo}
          disabled={isPending}
          className="text-sm font-semibold text-amber-400 hover:text-amber-300 shrink-0 disabled:opacity-50 transition-colors"
        >
          {isPending ? '処理中...' : '元に戻す'}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="閉じる"
        className="text-gray-400 hover:text-white shrink-0 transition-colors"
      >
        ✕
      </button>
    </div>
  )
}
