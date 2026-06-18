'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { copyShiftsToNextWeek } from './actions'

interface CopyShiftsButtonProps {
  currentWeekDates: string[]
  nextWeekLabel: string
  nextWeekDate: string
}

export function CopyShiftsButton({ currentWeekDates, nextWeekLabel, nextWeekDate }: CopyShiftsButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const router = useRouter()

  function handleCopy() {
    if (!confirm(`この週のシフト（${currentWeekDates.length}日分）を来週（${nextWeekLabel}）にコピーしますか？\n※来週の既存シフトは上書きされます。`)) return
    setMessage('')
    startTransition(async () => {
      const { count, error } = await copyShiftsToNextWeek(currentWeekDates)
      if (error) {
        setMessage(`エラー: ${error}`)
      } else if (count === 0) {
        setMessage('コピーするシフトがありません')
      } else {
        router.push(`/shifts?date=${nextWeekDate}`)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleCopy}
        disabled={isPending}
        className="text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        {isPending ? 'コピー中...' : '来週にコピー'}
      </button>
      {message && (
        <span className="text-xs text-amber-600">{message}</span>
      )}
    </div>
  )
}
