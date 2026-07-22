'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { SUBJECTS, getSlotLabel } from '@/lib/constants/timeSlots'
import { getDisplayGrade } from '@/lib/utils/grade'
import { checkIntensiveConflicts } from '@/lib/utils/intensiveConflictChecker'
import {
  upsertIntensivePlan,
  deleteIntensivePlan,
  enrollIntensiveLesson,
  unenrollIntensiveLesson,
  saveStudentPlans,
} from './actions'

type PlanCategory = 'applied' | 'makeup' | 'special'

const CATEGORY_LABELS: Record<PlanCategory, string> = { applied: '申込', makeup: '振替', special: '特替' }
const CATEGORY_BADGE: Record<PlanCategory, string> = {
  applied: 'bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300',
  makeup:  'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
  special: 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300',
}

export interface IntensivePlannerStudent {
  id: string
  name: string
  grade: string
  subjects?: string[]
  parent_requests?: string
  is_trial?: boolean
}

export interface IntensivePlannerLesson {
  id: string
  subject: string
  type: 'group' | 'individual'
  day_of_week: number
  slot_index: number
  term_type: 'regular' | 'intensive'
  specific_date: string | null
  lesson_kind: string
  capacity: number
  teacher: { id: string; name: string } | null
  enrollments: { student_id: string }[]
}

export interface IntensivePlannerPlan {
  id: string
  student_id: string
  term_period_id: string
  subject: string
  planned_count: number
  category: PlanCategory
}

interface IntensivePlannerProps {
  students: IntensivePlannerStudent[]
  lessons: IntensivePlannerLesson[]
  plans: IntensivePlannerPlan[]
  termPeriodId: string
  termPeriodName: string
}

const DAY_NAMES: Record<number, string> = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' }

// コマの消化を 振替→特替→申込 の優先順で割り当て
function calcCategoryProgress(categoryPlans: IntensivePlannerPlan[], enrolledCount: number) {
  const getCount = (cat: PlanCategory) =>
    categoryPlans.find((p) => p.category === cat)?.planned_count ?? 0
  const makeupTotal = getCount('makeup')
  const specialTotal = getCount('special')
  const appliedTotal = getCount('applied')

  let rem = enrolledCount
  const makeupUsed = Math.min(rem, makeupTotal); rem -= makeupUsed
  const specialUsed = Math.min(rem, specialTotal); rem -= specialUsed
  const appliedUsed = Math.min(rem, appliedTotal)

  return {
    applied:  { used: appliedUsed, total: appliedTotal },
    makeup:   { used: makeupUsed,  total: makeupTotal  },
    special:  { used: specialUsed, total: specialTotal  },
    grandTotal: appliedTotal + makeupTotal + specialTotal,
  }
}

type BulkRow = { subject: string; count: string; category: PlanCategory }

export function IntensivePlanner({
  students,
  lessons,
  plans,
  termPeriodId,
  termPeriodName,
}: IntensivePlannerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [editingPlan, setEditingPlan] = useState<{ subject: string; count: string; category: PlanCategory } | null>(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [bulkRows, setBulkRows] = useState<BulkRow[] | null>(null)
  const [error, setError] = useState<string>()
  const [showOverview, setShowOverview] = useState(false)
  const [showConflictDetail, setShowConflictDetail] = useState(false)

  const selectedStudent = students.find((s) => s.id === selectedStudentId)
  const studentPlans = useMemo(
    () => plans.filter((p) => p.student_id === selectedStudentId),
    [plans, selectedStudentId]
  )

  // 科目 → プラン一覧（複数区分）
  const plansBySubject = useMemo(() => {
    const map = new Map<string, IntensivePlannerPlan[]>()
    for (const p of studentPlans) {
      if (!map.has(p.subject)) map.set(p.subject, [])
      map.get(p.subject)!.push(p)
    }
    return map
  }, [studentPlans])

  // 整合チェック（全コマ対象・クライアント側で常時計算）
  const conflicts = useMemo(() => {
    const nameMap = new Map(students.map((s) => [s.id, s.name]))
    return checkIntensiveConflicts(lessons, nameMap)
  }, [lessons, students])

  const enrolledCountBySubject = useMemo(() => {
    if (!selectedStudentId) return {}
    const counts: Record<string, number> = {}
    for (const lesson of lessons) {
      if (lesson.enrollments.some((e) => e.student_id === selectedStudentId)) {
        counts[lesson.subject] = (counts[lesson.subject] ?? 0) + 1
      }
    }
    return counts
  }, [lessons, selectedStudentId])

  function getStudentProgress(studentId: string) {
    const sp = plans.filter((p) => p.student_id === studentId)
    const total = sp.reduce((s, p) => s + p.planned_count, 0)
    const enrolled = lessons.reduce((s, l) => {
      if (l.enrollments.some((e) => e.student_id === studentId)) return s + 1
      return s
    }, 0)
    return { total, enrolled, subjects: new Set(sp.map((p) => p.subject)).size }
  }

  function getSubjectLessons(subject: string) {
    return lessons
      .filter((l) => l.subject === subject)
      .sort((a, b) => {
        if (a.specific_date && b.specific_date) return a.specific_date.localeCompare(b.specific_date)
        if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
        return a.slot_index - b.slot_index
      })
  }

  function isEnrolled(lessonId: string) {
    if (!selectedStudentId) return false
    return lessons.find((l) => l.id === lessonId)?.enrollments.some((e) => e.student_id === selectedStudentId) ?? false
  }

  function isFull(lesson: IntensivePlannerLesson) {
    return lesson.enrollments.length >= lesson.capacity
  }

  function handleEnrollToggle(lessonId: string) {
    if (!selectedStudentId) return
    setError(undefined)
    startTransition(async () => {
      const res = isEnrolled(lessonId)
        ? await unenrollIntensiveLesson(selectedStudentId, lessonId)
        : await enrollIntensiveLesson(selectedStudentId, lessonId)
      if (res.error) { setError(`割り当ての保存に失敗しました: ${res.error}`); return }
      router.refresh()
    })
  }

  function handleSavePlan() {
    if (!editingPlan || !selectedStudentId) return
    const count = parseInt(editingPlan.count)
    if (!count || count < 1) return
    setError(undefined)
    startTransition(async () => {
      const res = await upsertIntensivePlan(selectedStudentId, termPeriodId, editingPlan.subject, count, editingPlan.category)
      if (res.error) { setError(`持ちコマの保存に失敗しました: ${res.error}`); return }
      setEditingPlan(null)
      router.refresh()
    })
  }

  function handleDeletePlan(subject: string) {
    if (!selectedStudentId) return
    setError(undefined)
    startTransition(async () => {
      const res = await deleteIntensivePlan(selectedStudentId, termPeriodId, subject)
      if (res.error) { setError(`削除に失敗しました: ${res.error}`); return }
      router.refresh()
    })
  }

  function openBulkEditor() {
    if (studentPlans.length > 0) {
      setBulkRows(studentPlans.map((p) => ({ subject: p.subject, count: String(p.planned_count), category: p.category })))
    } else if ((selectedStudent?.subjects?.length ?? 0) > 0) {
      setBulkRows(selectedStudent!.subjects!.map((s) => ({ subject: s, count: '1', category: 'applied' as PlanCategory })))
    } else {
      setBulkRows([{ subject: SUBJECTS[0], count: '1', category: 'applied' }])
    }
    setEditingPlan(null)
  }

  function handleSaveBulk() {
    if (!bulkRows || !selectedStudentId) return
    // (subject, category) の重複チェック
    const keys = bulkRows.map((r) => `${r.subject}|${r.category}`)
    if (new Set(keys).size < keys.length) {
      setError('同じ科目・区分の組み合わせが重複しています')
      return
    }
    const plans = bulkRows.map((r) => ({ subject: r.subject, count: parseInt(r.count) || 0, category: r.category }))
    setError(undefined)
    startTransition(async () => {
      const res = await saveStudentPlans(selectedStudentId, termPeriodId, plans)
      if (res.error) { setError(`持ちコマの保存に失敗しました: ${res.error}`); return }
      setBulkRows(null)
      router.refresh()
    })
  }

  // 区分別合計テキスト（「申込8・振替2（計10）」形式）
  function categoryBreakdownText(rows: { count: string; category: PlanCategory }[]) {
    const totals: Record<PlanCategory, number> = { applied: 0, makeup: 0, special: 0 }
    for (const r of rows) totals[r.category] += parseInt(r.count) || 0
    const parts = (['applied', 'makeup', 'special'] as PlanCategory[])
      .filter((c) => totals[c] > 0)
      .map((c) => `${CATEGORY_LABELS[c]}${totals[c]}`)
    const grand = totals.applied + totals.makeup + totals.special
    return parts.length > 0 ? `${parts.join('・')}（計${grand}）` : '0コマ'
  }

  const filteredStudents = students.filter((s) =>
    !studentSearch || s.name.includes(studentSearch) || s.grade.includes(studentSearch)
  )

  const studentsWithPlans = students.filter((s) => plans.some((p) => p.student_id === s.id))

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {/* 整合チェックバナー */}
      {(() => {
        const tc = conflicts.teacherConflicts.length
        const sc = conflicts.studentConflicts.length
        const hasConflict = tc > 0 || sc > 0
        if (!hasConflict) {
          return lessons.length > 0 ? (
            <p className="text-xs text-green-600 dark:text-green-400 px-1">✓ 重複なし</p>
          ) : null
        }
        const parts = [
          tc > 0 ? `講師重複${tc}件` : '',
          sc > 0 ? `生徒重複${sc}件` : '',
        ].filter(Boolean).join('・')
        return (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3">
            <button
              onClick={() => setShowConflictDetail((v) => !v)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className="text-xs font-bold text-red-600 dark:text-red-400">⚠ {parts}</span>
              <span className="text-xs text-red-400 ml-auto">{showConflictDetail ? '▲ 閉じる' : '▼ 詳細'}</span>
            </button>
            {showConflictDetail && (
              <div className="mt-2 space-y-1">
                {conflicts.teacherConflicts.map((c, i) => (
                  <p key={`t${i}`} className="text-xs text-red-600 dark:text-red-400">・講師: {c.label}</p>
                ))}
                {conflicts.studentConflicts.map((c, i) => (
                  <p key={`s${i}`} className="text-xs text-red-600 dark:text-red-400">・生徒: {c.label}</p>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* 持ちコマ一覧（全生徒） */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowOverview((v) => !v)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left"
        >
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
            持ちコマ一覧
            <span className="ml-2 text-xs font-normal text-gray-400">
              設定済み {studentsWithPlans.length}名 / 全{students.length}名
            </span>
          </p>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${showOverview ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showOverview && (
          studentsWithPlans.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center border-t border-gray-100 dark:border-gray-700">
              持ちコマが設定された生徒はまだいません
            </p>
          ) : (
            <div className="border-t border-gray-100 dark:border-gray-700 overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">生徒</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">学年</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">持ちコマ内訳</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">割当済み/合計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {studentsWithPlans.map((s) => {
                    const { total, enrolled } = getStudentProgress(s.id)
                    const sp = plans.filter((p) => p.student_id === s.id)
                    // 科目×区分をグルーピングして表示
                    const bySubject = new Map<string, IntensivePlannerPlan[]>()
                    for (const p of sp) {
                      if (!bySubject.has(p.subject)) bySubject.set(p.subject, [])
                      bySubject.get(p.subject)!.push(p)
                    }
                    const breakdown = Array.from(bySubject.entries()).map(([subj, catPlans]) => {
                      const parts = catPlans.map((p) => `${CATEGORY_LABELS[p.category]}${p.planned_count}`)
                      return `${subj}(${parts.join('・')})`
                    }).join('、')
                    return (
                      <tr
                        key={s.id}
                        onClick={() => { setSelectedStudentId(s.id); setShowOverview(false) }}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{s.name}</td>
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">{getDisplayGrade(s.grade)}</td>
                        <td className="px-4 py-2 text-gray-600 dark:text-gray-300 text-xs">{breakdown}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={[
                            'text-xs font-bold px-2 py-0.5 rounded-full',
                            enrolled >= total
                              ? 'bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300'
                              : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
                          ].join(' ')}>
                            {enrolled}/{total}コマ
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* 生徒一覧 */}
      <div className="lg:col-span-1">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">生徒を選択</p>
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="名前・学年で検索"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy"
            />
          </div>
          <ul className="divide-y divide-gray-50 dark:divide-gray-700 max-h-[600px] overflow-y-auto">
            {filteredStudents.map((student) => {
              const { total, enrolled, subjects } = getStudentProgress(student.id)
              const isSelected = student.id === selectedStudentId
              return (
                <li key={student.id}>
                  <button
                    onClick={() => setSelectedStudentId(isSelected ? null : student.id)}
                    className={[
                      'w-full flex items-center justify-between px-4 py-3 text-left transition-colors',
                      isSelected ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                    ].join(' ')}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{student.name}</p>
                        {student.is_trial && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-orange-100 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300 font-medium flex-shrink-0">体験</span>
                        )}
                        {student.parent_requests && (
                          <div className="relative group/req flex-shrink-0">
                            <span className="text-xs cursor-default select-none">💬</span>
                            <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover/req:block w-56 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-pre-wrap pointer-events-none">
                              {student.parent_requests}
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{getDisplayGrade(student.grade)}</p>
                    </div>
                    <div className="ml-2 text-right flex-shrink-0">
                      {subjects > 0 ? (
                        <>
                          <p className={[
                            'text-xs font-bold',
                            enrolled >= total ? 'text-green-600 dark:text-green-300' : 'text-amber-brand',
                          ].join(' ')}>
                            {enrolled}/{total}コマ
                          </p>
                          <p className="text-[10px] text-gray-400">{subjects}科目</p>
                        </>
                      ) : (
                        <p className="text-[10px] text-gray-300">未設定</p>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* 割り振りパネル */}
      <div className="lg:col-span-2">
        {!selectedStudent ? (
          <div className="bg-gray-50 dark:bg-gray-900/50 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-400 text-sm">
            左から生徒を選択してください
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <p className="font-bold text-gray-900 dark:text-gray-100 text-lg">{selectedStudent.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{getDisplayGrade(selectedStudent.grade)}　{termPeriodName}</p>
                </div>
                {/* 科目追加フォーム */}
                {editingPlan ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={editingPlan.subject}
                      onChange={(e) => setEditingPlan({ ...editingPlan, subject: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm"
                    >
                      {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select
                      value={editingPlan.category}
                      onChange={(e) => setEditingPlan({ ...editingPlan, category: e.target.value as PlanCategory })}
                      className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm"
                    >
                      {(['applied', 'makeup', 'special'] as PlanCategory[]).map((c) => (
                        <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={editingPlan.count}
                      onChange={(e) => setEditingPlan({ ...editingPlan, count: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm w-16"
                      placeholder="コマ数"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">コマ</span>
                    <button
                      onClick={handleSavePlan}
                      disabled={isPending}
                      className="px-3 py-1.5 bg-navy text-white text-sm rounded-lg hover:bg-navy-dark disabled:opacity-50"
                    >
                      保存
                    </button>
                    <button onClick={() => setEditingPlan(null)} className="text-sm text-gray-400 hover:text-gray-600">
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={openBulkEditor}
                      className="px-3 py-1.5 bg-navy text-white text-sm rounded-lg hover:bg-navy-dark transition-colors"
                    >
                      持ちコマをまとめて設定
                    </button>
                    <button
                      onClick={() => { setEditingPlan({ subject: SUBJECTS[0], count: '1', category: 'applied' }); setBulkRows(null) }}
                      className="px-3 py-1.5 border border-navy text-navy dark:text-blue-300 text-sm rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      + 1行追加
                    </button>
                  </div>
                )}
              </div>

              {/* 持ちコマまとめて入力パネル */}
              {bulkRows && (
                <div className="mb-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
                    {selectedStudent?.name}さんの持ちコマ（{termPeriodName}）
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-300 mb-3">
                    申込＝講習の新規申込 ／ 振替＝通常授業の欠席消化 ／ 特替＝特別補講
                  </p>
                  <div className="space-y-2">
                    {bulkRows.map((row, i) => (
                      <div key={i} className="flex items-center gap-2 flex-wrap">
                        <select
                          value={row.subject}
                          onChange={(e) => setBulkRows(bulkRows.map((r, ri) => ri === i ? { ...r, subject: e.target.value } : r))}
                          className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm"
                        >
                          {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select
                          value={row.category}
                          onChange={(e) => setBulkRows(bulkRows.map((r, ri) => ri === i ? { ...r, category: e.target.value as PlanCategory } : r))}
                          className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm"
                        >
                          {(['applied', 'makeup', 'special'] as PlanCategory[]).map((c) => (
                            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={row.count}
                          onChange={(e) => setBulkRows(bulkRows.map((r, ri) => ri === i ? { ...r, count: e.target.value } : r))}
                          className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm w-16"
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400">コマ</span>
                        <button
                          onClick={() => setBulkRows(bulkRows.filter((_, ri) => ri !== i))}
                          className="text-gray-300 hover:text-red-400 text-sm px-1"
                          title="この行を削除"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <button
                      onClick={() => setBulkRows([...bulkRows, { subject: SUBJECTS[0], count: '1', category: 'applied' }])}
                      className="text-xs text-navy dark:text-blue-300 hover:underline"
                    >
                      + 行を追加
                    </button>
                    <div className="ml-auto flex items-center gap-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {categoryBreakdownText(bulkRows)}
                      </span>
                      <button
                        onClick={handleSaveBulk}
                        disabled={isPending}
                        className="px-4 py-1.5 bg-navy text-white text-sm rounded-lg hover:bg-navy-dark disabled:opacity-50"
                      >
                        {isPending ? '保存中...' : '保存する'}
                      </button>
                      <button
                        onClick={() => setBulkRows(null)}
                        className="text-sm text-gray-400 hover:text-gray-600 px-2"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 科目別プランと割り振り */}
              {plansBySubject.size === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  科目ごとのコマ数を設定してください
                </p>
              ) : (
                <div className="space-y-5">
                  {Array.from(plansBySubject.entries()).map(([subject, categoryPlans]) => {
                    const subjectLessons = getSubjectLessons(subject)
                    const enrolledCount = enrolledCountBySubject[subject] ?? 0
                    const progress = calcCategoryProgress(categoryPlans, enrolledCount)
                    const remaining = progress.grandTotal - enrolledCount
                    return (
                      <div key={subject} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                        <div className={[
                          'flex items-center justify-between px-4 py-2.5',
                          remaining <= 0 ? 'bg-green-50 dark:bg-green-950/40' : 'bg-gray-50 dark:bg-gray-900/50',
                        ].join(' ')}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-800 dark:text-gray-100">{subject}</span>
                            {/* 区分別進捗バッジ */}
                            {(['makeup', 'special', 'applied'] as PlanCategory[]).map((cat) => {
                              const p = progress[cat]
                              if (p.total === 0) return null
                              return (
                                <span key={cat} className={`text-xs font-medium px-1.5 py-0.5 rounded ${CATEGORY_BADGE[cat]}`}>
                                  {CATEGORY_LABELS[cat]} {p.used}/{p.total}{p.used >= p.total ? ' ✓' : ''}
                                </span>
                              )
                            })}
                            {remaining > 0 && (
                              <span className="text-xs text-gray-400">あと{remaining}コマ</span>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeletePlan(subject)}
                            disabled={isPending}
                            className="text-xs text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                          >
                            削除
                          </button>
                        </div>

                        {subjectLessons.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-3">
                            この科目の講習コマがまだありません
                          </p>
                        ) : (
                          <div className="divide-y divide-gray-50 dark:divide-gray-700">
                            {subjectLessons.map((lesson) => {
                              const enrolled = isEnrolled(lesson.id)
                              const full = !enrolled && isFull(lesson)
                              const overPlan = !enrolled && enrolledCount >= progress.grandTotal
                              const dateLabel = lesson.specific_date
                                ? new Date(lesson.specific_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
                                : `${DAY_NAMES[lesson.day_of_week] ?? ''}曜`
                              const timeLabel = getSlotLabel(lesson.slot_index, lesson.day_of_week, lesson.term_type, lesson.type)

                              return (
                                <div
                                  key={lesson.id}
                                  className={[
                                    'flex items-center justify-between px-4 py-2.5',
                                    enrolled ? 'bg-teal-50 dark:bg-teal-950/40' : '',
                                    (full || overPlan) ? 'opacity-50' : '',
                                  ].join(' ')}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="text-xs text-gray-600 dark:text-gray-300 w-20 flex-shrink-0">
                                      <p className="font-medium">{dateLabel}</p>
                                      <p className="text-gray-400">{timeLabel}</p>
                                    </div>
                                    <div className="min-w-0">
                                      {lesson.teacher?.name && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{lesson.teacher.name}</p>
                                      )}
                                      <p className="text-[10px] text-gray-400">
                                        {lesson.enrollments.length}/{lesson.capacity}名
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {conflicts.conflictLessonIds.has(lesson.id) && (
                                      <span className="text-[10px] text-red-500 font-bold" title="重複あり">⚠</span>
                                    )}
                                    {full && !enrolled && (
                                      <span className="text-[10px] text-red-400">定員満</span>
                                    )}
                                    {overPlan && !enrolled && (
                                      <span className="text-[10px] text-amber-700 dark:text-amber-400">予定超過</span>
                                    )}
                                    <button
                                      onClick={() => handleEnrollToggle(lesson.id)}
                                      disabled={isPending || (full && !enrolled)}
                                      className={[
                                        'px-3 py-1 text-xs rounded-lg border transition-colors',
                                        enrolled
                                          ? 'bg-teal-500 text-white border-teal-500 hover:bg-teal-600'
                                          : (full || overPlan)
                                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed'
                                            : 'bg-white dark:bg-gray-800 text-teal-600 dark:text-teal-300 border-teal-300 dark:border-teal-800 hover:bg-teal-50',
                                      ].join(' ')}
                                    >
                                      {enrolled ? '割り当て済 ✓' : '割り当てる'}
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
