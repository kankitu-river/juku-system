'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { autoAssignBooths } from '@/app/(dashboard)/booths/actions'

interface Props {
  dateStr: string
  dow: number
  termType: 'regular' | 'intensive'
}

export function DayBoothAssignButton({ dateStr, dow, termType }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  function handleClick() {
    if (!confirm('この日の未割り当てコマにブースを自動割り当てします。よろしいですか？')) return
    setResult(null)
    startTransition(async () => {
      const res = await autoAssignBooths(dateStr, dow, termType)
      setResult(res.error ? `エラー: ${res.error}` : `${res.assigned}件のコマにブースを割り当てました`)
      setTimeout(() => { setResult(null); router.refresh() }, 2000)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        {pending ? '割り当て中…' : '自動ブース割り当て'}
      </button>
      {result && <span className="text-sm text-green-600 dark:text-green-400">{result}</span>}
    </div>
  )
}
