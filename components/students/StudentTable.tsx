'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Student } from '@/types'
import { getDisplayGrade } from '@/lib/utils/grade'

const DAY_LABELS: Record<number, string> = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' }
type FixedSlot = { day: number; slot: number }

export function StudentTable({ students }: { students: Student[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [showTrial, setShowTrial] = useState(false)

  const nonTrial = students.filter((s) => !s.is_trial)

  // 表示中の生徒に存在する学年だけを選択肢にする（元の並び順を維持）
  const gradeOptions = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const s of nonTrial) {
      if (!seen.has(s.grade)) {
        seen.add(s.grade)
        result.push(s.grade)
      }
    }
    return result
  }, [nonTrial])

  const base = showTrial ? students : nonTrial
  const filtered = base.filter((s) => {
    if (gradeFilter && s.grade !== gradeFilter) return false
    if (query && !s.name.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  return (
    <div>
      {/* 検索・学年フィルタ */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名前で検索..."
            className="pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg w-52 focus:outline-none focus:border-navy"
          />
        </div>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="">全学年</option>
          {gradeOptions.map((g) => (
            <option key={g} value={g}>{getDisplayGrade(g)}</option>
          ))}
        </select>
        {(query || gradeFilter) && (
          <span className="text-xs text-gray-400">{filtered.length}名がヒット</span>
        )}
        <button
          onClick={() => setShowTrial((v) => !v)}
          className={[
            'ml-auto text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
            showTrial
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
              : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400',
          ].join(' ')}
        >
          体験枠を{showTrial ? '非表示' : '表示'}
        </button>
      </div>

      {filtered.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <th className="text-left px-5 py-3 font-medium text-gray-600 dark:text-gray-300">氏名</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600 dark:text-gray-300">学年</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600 dark:text-gray-300">固定曜日</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600 dark:text-gray-300">受講科目</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filtered.map((student) => (
                <tr
                  key={student.id}
                  onClick={() => router.push(`/students/${student.id}`)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">
                    <span className="inline-flex items-center gap-1.5">
                      {student.name}
                      {student.is_trial && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">体験</span>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{getDisplayGrade(student.grade)}</td>
                  <td className="px-5 py-3">
                    {(student.fixed_slots as FixedSlot[] | undefined)?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {(student.fixed_slots as FixedSlot[]).map(({ day, slot }) => (
                          <span key={`${day}-${slot}`} className="text-[10px] bg-navy text-white px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                            {DAY_LABELS[day]}・{slot}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">未設定</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {student.subjects.map((s) => (
                        <span key={s} className="text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-navy dark:text-blue-300 border border-navy dark:border-blue-300 rounded-lg">
                      編集
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">条件に一致する生徒がいません</p>
        </div>
      )}
    </div>
  )
}
