'use client'

import { useState, useTransition, useMemo } from 'react'
import { generateDraftSchedule, applyDraftSchedule } from '../actions'
import { getDisplayGrade } from '@/lib/utils/grade'
import type { DraftScheduleResult, ProposedAssignment } from '@/lib/utils/intensiveScheduler'

interface Props {
  termPeriodId: string
  termPeriodName: string
}

const REASON_COLORS: Record<string, string> = {
  regular_senior: 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300',
  regular: 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300',
  preferred: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
  compatible: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
}

export function IntensiveAutoScheduler({ termPeriodId, termPeriodName }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isApplying, startApplying] = useTransition()
  const [result, setResult] = useState<DraftScheduleResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [appliedCount, setAppliedCount] = useState(0)

  // チェックを外した割り当てID set
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  function assignmentKey(a: ProposedAssignment) {
    return `${a.studentId}__${a.lessonId}`
  }

  function handleGenerate() {
    setResult(null)
    setError(null)
    setApplied(false)
    setExcluded(new Set())
    startTransition(async () => {
      const res = await generateDraftSchedule(termPeriodId)
      if (res.error) {
        setError(res.error)
      } else if (res.result) {
        setResult(res.result)
      }
    })
  }

  function toggleExclude(key: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleApply() {
    if (!result) return
    const toApply = result.assignments
      .filter((a) => !excluded.has(assignmentKey(a)))
      .map((a) => ({ studentId: a.studentId, lessonId: a.lessonId }))

    startApplying(async () => {
      const res = await applyDraftSchedule(toApply)
      if (res.error) {
        setError(res.error)
      } else {
        setApplied(true)
        setAppliedCount(res.count)
      }
    })
  }

  // 生徒別にまとめる
  const grouped = useMemo(() => {
    if (!result) return []
    const map = new Map<string, { name: string; grade: string; assignments: ProposedAssignment[] }>()
    for (const a of result.assignments) {
      if (!map.has(a.studentId)) {
        map.set(a.studentId, { name: a.studentName, grade: a.studentGrade, assignments: [] })
      }
      map.get(a.studentId)!.assignments.push(a)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }, [result])

  const selectedCount = result
    ? result.assignments.filter((a) => !excluded.has(assignmentKey(a))).length
    : 0

  return (
    <div className="space-y-5">
      {/* 実行パネル */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-bold text-gray-900 dark:text-gray-100 text-base mb-1">自動割り振り</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              通常授業の担当先生・来塾希望・相性情報を元に、講習コマへの割り振り案を自動生成します。
              生成後に個別調整してから「適用」できます。
            </p>
            <ul className="mt-2 text-xs text-gray-400 space-y-0.5">
              <li>・ 高3（受験生）は通常担当の先生を優先して確保</li>
              <li>・ 来塾希望が入力済みの生徒は、希望コマ外は候補から除外</li>
              <li>・ NG先生には割り振らない</li>
              <li>・ 同じ日・同じ時間帯への重複割り当てはしない</li>
              <li>・ 同一科目はなるべく別の日に分散（足りない場合のみ同日複数コマ）</li>
              <li>・ この講習期間内のコマだけが対象</li>
            </ul>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isPending}
            className="flex-shrink-0 px-5 py-2.5 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-dark disabled:opacity-50 transition-colors"
          >
            {isPending ? '生成中...' : result ? '再生成' : '割り振り案を生成'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {applied && (
        <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-xl p-4 text-sm font-semibold text-green-700 dark:text-green-300">
          {appliedCount}件の割り振りを適用しました
        </div>
      )}

      {result && !applied && (
        <>
          {/* サマリー */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-teal-50 dark:bg-teal-950/40 rounded-xl border border-teal-100 px-4 py-3">
              <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{result.assignments.length}</p>
              <p className="text-xs text-teal-600 dark:text-teal-300 mt-0.5">割り振り提案数</p>
            </div>
            <div className={[
              'rounded-xl border px-4 py-3',
              result.conflicts.length > 0 ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-100' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-700',
            ].join(' ')}>
              <p className={[
                'text-2xl font-bold',
                result.conflicts.length > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-gray-400',
              ].join(' ')}>{result.conflicts.length}</p>
              <p className={[
                'text-xs mt-0.5',
                result.conflicts.length > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-gray-400',
              ].join(' ')}>未解決の割り振り</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-100 px-4 py-3">
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{selectedCount}</p>
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-0.5">選択中（適用予定）</p>
            </div>
          </div>

          {/* 割り振り一覧 */}
          {grouped.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">割り振り提案一覧</p>
                <p className="text-xs text-gray-400">チェックを外したコマは適用されません</p>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-700 max-h-[500px] overflow-y-auto">
                {grouped.map((group) => (
                  <div key={group.name}>
                    <div className="px-5 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{group.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{getDisplayGrade(group.grade)}</span>
                      <span className="text-xs text-gray-400 ml-2">{group.assignments.length}コマ</span>
                    </div>
                    {group.assignments.map((a) => {
                      const key = assignmentKey(a)
                      const checked = !excluded.has(key)
                      return (
                        <div
                          key={key}
                          className={[
                            'flex items-center gap-3 px-5 py-2.5 transition-colors',
                            checked ? '' : 'opacity-40 bg-gray-50 dark:bg-gray-900/50',
                          ].join(' ')}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleExclude(key)}
                            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-teal-500 focus:ring-teal-400"
                          />
                          <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                            <span className="text-gray-700 dark:text-gray-300 font-medium">{a.subject}</span>
                            <span className="text-gray-500 dark:text-gray-400">{a.lessonLabel}</span>
                            <span className="text-gray-500 dark:text-gray-400">{a.teacherName ?? '先生未定'}</span>
                          </div>
                          <span className={[
                            'text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0',
                            REASON_COLORS[a.reasonCode] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                          ].join(' ')}>
                            {a.reasonLabel}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* コンフリクト一覧 */}
          {result.conflicts.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-amber-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-100 bg-amber-50 dark:bg-amber-950/40">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  未解決の割り振り ({result.conflicts.length}件)
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                  コマが足りない・希望日程と空きがない場合。手動で追加してください。
                </p>
              </div>
              <div className="divide-y divide-amber-50">
                {result.conflicts.map((c) => (
                  <div key={`${c.studentId}__${c.subject}`} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.studentName}</span>
                          <span className="text-xs text-gray-400">{getDisplayGrade(c.studentGrade)}</span>
                          {c.isSenior && (
                            <span className="text-[10px] bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-300 px-1.5 py-0.5 rounded-full font-medium">受験生</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          <span className="font-medium">{c.subject}</span>：
                          {c.needed}コマ必要 → {c.found}コマしか割り振れず
                        </p>
                        {c.regularTeacherNoSlots && c.regularTeacherName && (
                          <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                            通常担当「{c.regularTeacherName}」の講習コマが不足
                          </p>
                        )}
                      </div>
                      {c.alternatives.length > 0 && (
                        <div className="flex-shrink-0">
                          <p className="text-[10px] text-gray-400 mb-1">代替候補の先生</p>
                          <div className="space-y-0.5">
                            {c.alternatives.map((alt) => (
                              <p key={alt.teacherId} className="text-xs text-gray-600 dark:text-gray-300">
                                {alt.teacherName}
                                <span className="text-gray-400 ml-1">({alt.availableCount}コマ空き)</span>
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 適用ボタン */}
          {result.assignments.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={handleApply}
                disabled={isApplying || selectedCount === 0}
                className="px-6 py-3 bg-teal-600 text-white font-semibold text-sm rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors shadow"
              >
                {isApplying ? '適用中...' : `選択した ${selectedCount} 件を適用する`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
