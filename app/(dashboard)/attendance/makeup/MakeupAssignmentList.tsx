'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cancelMakeupAssignment } from '@/app/(dashboard)/attendance/actions'
import { getSlotLabel } from '@/lib/constants/timeSlots'
import { getDisplayGrade } from '@/lib/utils/grade'

export interface MakeupAssignment {
  id: string
  assigned_date: string
  created_at: string
  student: { id: string; name: string; grade: string } | null
  lesson: {
    id: string
    slot_index: number
    day_of_week: number
    term_type: 'regular' | 'intensive'
    type: 'group' | 'individual'
    subject: string | null
    teacher: { id: string; name: string } | null
  } | null
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`)
  return `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）`
}

function AssignmentRow({ a, todayStr, onCancel, isPending }: {
  a: MakeupAssignment
  todayStr: string
  onCancel?: (a: MakeupAssignment) => void
  isPending: boolean
}) {
  const lesson = a.lesson
  const isPast = a.assigned_date < todayStr
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
      <Link
        href={`/schedule?view=day&date=${a.assigned_date}`}
        className={[
          'text-sm font-semibold hover:underline whitespace-nowrap',
          isPast ? 'text-gray-500 dark:text-gray-400' : 'text-navy dark:text-blue-300',
        ].join(' ')}
        title="この日の日次ビューを開く"
      >
        {formatDate(a.assigned_date)}
      </Link>
      {lesson && (
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          第{lesson.slot_index}コマ {getSlotLabel(lesson.slot_index, lesson.day_of_week, lesson.term_type, lesson.type)}
        </span>
      )}
      <span className="text-sm text-gray-800 dark:text-gray-100 font-medium">
        {a.student?.name ?? '—'}
        {a.student && (
          <span className="text-xs text-gray-400 ml-1">{getDisplayGrade(a.student.grade)}</span>
        )}
      </span>
      {lesson?.teacher?.name && (
        <span className="text-xs bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full whitespace-nowrap">
          {lesson.teacher.name}先生
        </span>
      )}
      {lesson?.subject && (
        <span className="text-xs text-gray-400">{lesson.subject}</span>
      )}
      <span className="ml-auto flex items-center gap-2">
        {isPast ? (
          <span className="text-[10px] text-gray-400 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-0.5">使用済み</span>
        ) : (
          onCancel && (
            <button
              onClick={() => onCancel(a)}
              disabled={isPending}
              className="text-xs text-red-500 border border-red-200 dark:border-red-900 rounded-lg px-2.5 py-1 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 transition-colors"
            >
              取消
            </button>
          )
        )}
      </span>
    </div>
  )
}

// 割り当て済みの振替コマ一覧（今後の予定 + 使用履歴）
export function MakeupAssignmentList({ assignments, todayStr }: {
  assignments: MakeupAssignment[]
  todayStr: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const upcoming = assignments
    .filter((a) => a.assigned_date >= todayStr)
    .sort((a, b) => a.assigned_date.localeCompare(b.assigned_date))
  const past = assignments
    .filter((a) => a.assigned_date < todayStr)
    .sort((a, b) => b.assigned_date.localeCompare(a.assigned_date))

  function handleCancel(a: MakeupAssignment) {
    const label = `${formatDate(a.assigned_date)} ${a.student?.name ?? ''}`
    if (!confirm(`${label} さんの振替を取り消しますか？\n振替クレジットが1件戻り、この日の出欠記録も削除されます。`)) return
    setError('')
    startTransition(async () => {
      const res = await cancelMakeupAssignment(a.id)
      if (res.error) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="mt-8 space-y-4">
      {error && (
        <div className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* 今後の振替予定 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">今後の振替予定</h2>
          <span className="text-xs text-gray-400">{upcoming.length}件</span>
        </div>
        {upcoming.length > 0 ? (
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {upcoming.map((a) => (
              <AssignmentRow key={a.id} a={a} todayStr={todayStr} onCancel={handleCancel} isPending={isPending} />
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-gray-400 text-center">今後の振替予定はありません</p>
        )}
      </div>

      {/* 使用履歴 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between text-left"
        >
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            使用済みクレジットの履歴
            <span className="text-xs font-normal text-gray-400 ml-2">過去に割り当てた振替コマ</span>
          </h2>
          <span className="text-xs text-gray-400 flex items-center gap-1.5">
            {past.length}件
            <svg className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {showHistory && (
          past.length > 0 ? (
            <div className="divide-y divide-gray-50 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
              {past.map((a) => (
                <AssignmentRow key={a.id} a={a} todayStr={todayStr} isPending={isPending} />
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-400 text-center border-t border-gray-100 dark:border-gray-700">使用履歴はまだありません</p>
          )
        )}
      </div>
    </div>
  )
}
