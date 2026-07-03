'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export interface UnrecordedLesson {
  lessonId: string
  slotIndex: number
  timeLabel: string   // 例: '16:30〜18:00'
  endTime: string     // 'HH:MM'
  teacherName: string | null
  unrecordedCount: number
}

function jstTimeNow(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
}

// 終了時刻を過ぎたのに出欠未入力の生徒がいるコマを警告表示する。
// 時刻判定はクライアント側で行う（サーバーはUTCのため）。
export function UnrecordedAlert({ lessons }: { lessons: UnrecordedLesson[] }) {
  const [now, setNow] = useState<string | null>(null)

  useEffect(() => {
    setNow(jstTimeNow())
    const timer = setInterval(() => setNow(jstTimeNow()), 60_000)
    return () => clearInterval(timer)
  }, [])

  if (!now) return null
  const overdue = lessons.filter((l) => l.unrecordedCount > 0 && now >= l.endTime)
  if (overdue.length === 0) return null

  return (
    <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-red-600 font-semibold text-sm">🔔 出欠未入力のコマ</span>
        <span className="text-xs text-red-400">終了済みなのに出欠が入力されていません</span>
      </div>
      <div className="space-y-1.5">
        {overdue.map((l) => (
          <Link
            key={l.lessonId}
            href={`/attendance/${l.lessonId}`}
            className="flex items-center gap-3 bg-white border border-red-200 rounded-lg px-3 py-2 hover:border-red-400 transition-colors"
          >
            <span className="text-sm font-medium text-gray-800">
              第{l.slotIndex}コマ（{l.timeLabel}）
            </span>
            <span className="text-xs text-gray-500">
              {l.teacherName ? `${l.teacherName}先生` : '担当未設定'}
            </span>
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              未入力 {l.unrecordedCount}名
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
