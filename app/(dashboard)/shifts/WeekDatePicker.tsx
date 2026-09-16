'use client'

import { useRouter } from 'next/navigation'

// 表示する週の日付を選ぶカレンダーUI（スケジュール画面と同じ挙動）
export function WeekDatePicker({ value }: { value: string }) {
  const router = useRouter()
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => { if (e.target.value) router.push(`/shifts?date=${e.target.value}`) }}
      className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent"
      aria-label="表示する週の日付を選択"
    />
  )
}
