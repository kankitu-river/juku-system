'use client'

import { useState, useTransition, useMemo } from 'react'
import { generateDraftSchedule, applyDraftSchedule, applyScheduleSwap } from '../actions'
import { getDisplayGrade } from '@/lib/utils/grade'
import type { DraftScheduleResult, ProposedAssignment, SwapProposal } from '@/lib/utils/intensiveScheduler'

interface PlanStudent {
  id: string
  name: string
  grade: string
}

interface Props {
  termPeriodId: string
  termPeriodName: string
  planStudents?: PlanStudent[]
}

const REASON_COLORS: Record<string, string> = {
  regular_senior: 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300',
  regular: 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300',
  preferred: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
  compatible: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
}

export function IntensiveAutoScheduler({ termPeriodId, termPeriodName, planStudents = [] }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isApplying, startApplying] = useTransition()
  const [result, setResult] = useState<DraftScheduleResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [appliedCount, setAppliedCount] = useState(0)
  // 対象生徒の絞り込み（空 = 全員）
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set())
  const [showTargetPicker, setShowTargetPicker] = useState(false)

  function toggleTarget(id: string) {
    setTargetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // チェックを外した割り当てID set
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  // 適用済みの入れ替え提案（lessonId__inStudentId）
  const [appliedSwaps, setAppliedSwaps] = useState<Set<string>>(new Set())
  const [swapPendingKey, setSwapPendingKey] = useState<string | null>(null)

  function swapKey(s: SwapProposal) {
    return `${s.lessonId}__${s.inStudentId}`
  }

  function handleApplySwap(s: SwapProposal) {
    const key = swapKey(s)
    setSwapPendingKey(key)
    startApplying(async () => {
      const res = await applyScheduleSwap({
        lessonId: s.lessonId,
        subject: s.subject,
        inStudentId: s.inStudentId,
        outStudentId: s.outStudentId,
        outAlt: { lessonId: s.outAlt.lessonId, newLesson: s.outAlt.newLesson },
      })
      setSwapPendingKey(null)
      if (res.error) {
        setError(res.error)
      } else {
        setAppliedSwaps((prev) => new Set(prev).add(key))
      }
    })
  }

  function assignmentKey(a: ProposedAssignment) {
    const target = a.lessonId ?? `new_${a.newLesson?.teacherId}_${a.newLesson?.date}_${a.newLesson?.slotIndex}`
    return `${a.studentId}__${target}`
  }

  function handleGenerate() {
    setResult(null)
    setError(null)
    setApplied(false)
    setExcluded(new Set())
    setAppliedSwaps(new Set())
    startTransition(async () => {
      const res = await generateDraftSchedule(termPeriodId, Array.from(targetIds))
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
      .map((a) => ({
        studentId: a.studentId,
        lessonId: a.lessonId,
        subject: a.subject,
        newLesson: a.newLesson,
      }))

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
              <span className="font-semibold text-gray-700 dark:text-gray-200">先生のシフト × 生徒の来塾希望</span>をマッチングして割り振り案を自動生成します。
              コマが未作成でも、シフトに入っている先生との新規コマを提案し、適用時に自動でコマを作成します。
            </p>
            <ul className="mt-2 text-xs text-gray-400 space-y-0.5">
              <li>・ 先生がシフトに入っている日時 × 生徒の来塾希望が一致する枠に割り振り</li>
              <li>・ 既存の講習コマがあればそちらを優先して埋める</li>
              <li>・ 高3（受験生）は通常担当の先生を優先して確保</li>
              <li>・ NG先生には割り振らない・担当科目外の先生には割り振らない</li>
              <li>・ 同じ日・同じ時間帯への重複なし、同一科目はなるべく別の日に分散</li>
              <li>・ 新規コマは1コマ最大2名（同一科目のみ同席）</li>
            </ul>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isPending}
            className="flex-shrink-0 px-5 py-2.5 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-dark disabled:opacity-50 transition-colors"
          >
            {isPending
              ? '生成中...'
              : targetIds.size > 0
                ? `${targetIds.size}名分の案を生成`
                : result ? '再生成' : '割り振り案を生成'}
          </button>
        </div>

        {/* 対象生徒の絞り込み */}
        {planStudents.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">対象:</span>
              <button
                onClick={() => { setTargetIds(new Set()); setShowTargetPicker(false) }}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  targetIds.size === 0
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-navy',
                ].join(' ')}
              >
                全員（持ちコマあり{planStudents.length}名）
              </button>
              <button
                onClick={() => setShowTargetPicker((v) => !v)}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  targetIds.size > 0
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-navy',
                ].join(' ')}
              >
                生徒を選ぶ{targetIds.size > 0 ? `（${targetIds.size}名選択中）` : ''}
              </button>
            </div>
            {showTargetPicker && (
              <div className="mt-2 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                {planStudents.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => toggleTarget(s.id)}
                    className={[
                      'px-2.5 py-1 rounded-full text-xs border transition-colors',
                      targetIds.has(s.id)
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-teal-400',
                    ].join(' ')}
                  >
                    {s.name}
                    <span className="opacity-60 ml-1">{getDisplayGrade(s.grade)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
                            <span className="text-gray-700 dark:text-gray-300 font-medium">
                              {a.subject}
                              {a.isNew && (
                                <span className="ml-1.5 text-[9px] bg-orange-100 dark:bg-orange-900/60 text-orange-600 dark:text-orange-300 px-1 py-0.5 rounded font-bold align-middle">新規コマ</span>
                              )}
                            </span>
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

          {/* 入れ替え提案 */}
          {result.swaps.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-purple-100 dark:border-purple-900 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-purple-100 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/40">
                <p className="text-sm font-semibold text-purple-800 dark:text-purple-200">
                  🔄 入れ替え提案 ({result.swaps.length}件)
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-300 mt-0.5">
                  満員のコマですが、こちらの生徒の方が適合度が高いため、既存の生徒の移動先とセットで入れ替えを提案します
                </p>
              </div>
              <div className="divide-y divide-purple-50 dark:divide-gray-700">
                {result.swaps.map((s) => {
                  const key = swapKey(s)
                  const applied = appliedSwaps.has(key)
                  return (
                    <div key={key} className="px-5 py-3 flex items-center gap-4">
                      <div className="flex-1 text-xs space-y-1">
                        <p className="text-gray-800 dark:text-gray-100">
                          <span className="font-semibold">{s.inStudentName}</span> を
                          <span className="font-medium text-purple-700 dark:text-purple-300"> {s.lessonLabel}（{s.teacherName ?? '未定'}先生・{s.subject}）</span> に入れる
                          <span className="ml-1.5 text-[10px] bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full">{s.inReason}</span>
                        </p>
                        <p className="text-gray-500 dark:text-gray-400">
                          ⇄ <span className="font-medium">{s.outStudentName}</span> は
                          <span className="font-medium"> {s.outAlt.label}（{s.outAlt.teacherName ?? '未定'}先生）</span> へ移動
                          {!s.outAlt.lessonId && (
                            <span className="ml-1.5 text-[9px] bg-orange-100 dark:bg-orange-900/60 text-orange-600 dark:text-orange-300 px-1 py-0.5 rounded font-bold">新規コマ</span>
                          )}
                        </p>
                      </div>
                      {applied ? (
                        <span className="text-xs font-semibold text-green-600 dark:text-green-300 shrink-0">✓ 適用済み</span>
                      ) : (
                        <button
                          onClick={() => handleApplySwap(s)}
                          disabled={swapPendingKey !== null}
                          className="shrink-0 px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                        >
                          {swapPendingKey === key ? '適用中...' : '入れ替えを適用'}
                        </button>
                      )}
                    </div>
                  )
                })}
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
