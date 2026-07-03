'use client'

import { useState, useOptimistic, useTransition } from 'react'
import { toggleClosure } from './actions'

interface ClosureCalendarProps {
  initialClosureDates: string[]
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDaysInMonth(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function ClosureCalendar({ initialClosureDates }: ClosureCalendarProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  const [closureDates, setClosureDates] = useOptimistic<string[]>(initialClosureDates)

  const cells = getDaysInMonth(year, month)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  function handleToggle(date: Date) {
    const dateStr = toDateStr(date)
    setError(undefined)
    startTransition(async () => {
      const isClosed = closureDates.includes(dateStr)
      setClosureDates(isClosed
        ? closureDates.filter(d => d !== dateStr)
        : [...closureDates, dateStr]
      )
      const result = await toggleClosure(dateStr)
      if (result.error) setError(result.error)
    })
  }

  const closureThisMonth = closureDates
    .filter(d => d.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
    .sort()

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          保存に失敗しました：{error}
          <p className="mt-1 text-xs">Supabase SQL Editorで <code className="bg-red-100 px-1 rounded">SELECT * FROM school_closures LIMIT 1</code> を実行してテーブルの存在を確認してください。</p>
        </div>
      )}
      {/* 月ナビ */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 text-lg">‹</button>
        <span className="font-semibold text-gray-800">{year}年{month + 1}月</span>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 text-lg">›</button>
      </div>

      {/* カレンダーグリッド */}
      <div>
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES.map((d, i) => (
            <div key={d} className={[
              'text-center text-xs font-medium py-1',
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500',
            ].join(' ')}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`e-${i}`} />
            const dateStr = toDateStr(d)
            const isClosed = closureDates.includes(dateStr)
            const isToday = dateStr === toDateStr(today)
            const dow = d.getDay()
            const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate())
            return (
              <button
                key={dateStr}
                disabled={isPending}
                onClick={() => handleToggle(d)}
                className={[
                  'aspect-square rounded-xl text-sm font-medium transition-all flex flex-col items-center justify-center gap-0.5',
                  isClosed
                    ? 'bg-red-500 text-white shadow-sm'
                    : isPast
                      ? 'text-gray-300 hover:bg-gray-100'
                      : dow === 0 ? 'text-red-400 hover:bg-red-50'
                      : dow === 6 ? 'text-blue-400 hover:bg-blue-50'
                      : 'text-gray-700 hover:bg-gray-100',
                  isToday && !isClosed ? 'ring-2 ring-navy ring-offset-1' : '',
                ].join(' ')}
              >
                <span>{d.getDate()}</span>
                {isClosed && <span className="text-[8px] font-bold leading-none">休</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* この月の休校日リスト */}
      {closureThisMonth.length > 0 ? (
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-red-600 mb-2">{month + 1}月の休校日</p>
          <div className="flex flex-wrap gap-2">
            {closureThisMonth.map(d => {
              const date = new Date(d)
              return (
                <span key={d} className="text-xs bg-white border border-red-200 text-red-700 px-2 py-1 rounded-lg">
                  {date.getMonth() + 1}/{date.getDate()}（{DAY_NAMES[date.getDay()]}）
                </span>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center">この月の休校日はありません</p>
      )}

      <p className="text-xs text-gray-400">日付をタップして休校日を追加・解除できます</p>
    </div>
  )
}
