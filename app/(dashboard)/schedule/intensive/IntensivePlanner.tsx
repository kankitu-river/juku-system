'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { SUBJECTS, DAYS_OF_WEEK, getSlotLabel } from '@/lib/constants/timeSlots'
import { getDisplayGrade } from '@/lib/utils/grade'
import {
  upsertIntensivePlan,
  deleteIntensivePlan,
  enrollIntensiveLesson,
  unenrollIntensiveLesson,
  saveStudentPlans,
} from './actions'

interface Student {
  id: string
  name: string
  grade: string
  subjects?: string[]
}

interface Lesson {
  id: string
  subject: string
  type: string
  day_of_week: number
  slot_index: number
  term_type: string
  specific_date: string | null
  lesson_kind: string
  capacity: number
  teacher: { id: string; name: string } | null
  enrollments: { student_id: string }[]
}

interface IntensivePlan {
  id: string
  student_id: string
  term_period_id: string
  subject: string
  planned_count: number
}

interface IntensivePlannerProps {
  students: Student[]
  lessons: Lesson[]
  plans: IntensivePlan[]
  termPeriodId: string
  termPeriodName: string
}

const DAY_NAMES: Record<number, string> = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' }

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
  const [editingPlan, setEditingPlan] = useState<{ subject: string; count: string } | null>(null)
  const [studentSearch, setStudentSearch] = useState('')
  // 持ちコマまとめて入力
  const [bulkRows, setBulkRows] = useState<{ subject: string; count: string }[] | null>(null)

  const selectedStudent = students.find((s) => s.id === selectedStudentId)

  // 選択中生徒のプラン
  const studentPlans = useMemo(
    () => plans.filter((p) => p.student_id === selectedStudentId),
    [plans, selectedStudentId]
  )

  // 選択中生徒の講習コマ受講数（subject別）
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

  // 生徒別の進捗サマリー（一覧表示用）
  function getStudentProgress(studentId: string) {
    const sp = plans.filter((p) => p.student_id === studentId)
    const total = sp.reduce((s, p) => s + p.planned_count, 0)
    const enrolled = lessons.reduce((s, l) => {
      if (l.enrollments.some((e) => e.student_id === studentId)) return s + 1
      return s
    }, 0)
    return { total, enrolled, subjects: sp.length }
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
    return lessons
      .find((l) => l.id === lessonId)
      ?.enrollments.some((e) => e.student_id === selectedStudentId) ?? false
  }

  function isFull(lesson: Lesson) {
    return lesson.enrollments.length >= lesson.capacity
  }

  function handleEnrollToggle(lessonId: string) {
    if (!selectedStudentId) return
    startTransition(async () => {
      if (isEnrolled(lessonId)) {
        await unenrollIntensiveLesson(selectedStudentId, lessonId)
      } else {
        await enrollIntensiveLesson(selectedStudentId, lessonId)
      }
      router.refresh()
    })
  }

  function handleSavePlan() {
    if (!editingPlan || !selectedStudentId) return
    const count = parseInt(editingPlan.count)
    if (!count || count < 1) return
    startTransition(async () => {
      await upsertIntensivePlan(selectedStudentId, termPeriodId, editingPlan.subject, count)
      setEditingPlan(null)
      router.refresh()
    })
  }

  function handleDeletePlan(subject: string) {
    if (!selectedStudentId) return
    startTransition(async () => {
      await deleteIntensivePlan(selectedStudentId, termPeriodId, subject)
      router.refresh()
    })
  }

  // まとめて入力パネルを開く（既存プラン → なければ生徒の受講科目で初期化）
  function openBulkEditor() {
    if (studentPlans.length > 0) {
      setBulkRows(studentPlans.map((p) => ({ subject: p.subject, count: String(p.planned_count) })))
    } else if ((selectedStudent?.subjects?.length ?? 0) > 0) {
      setBulkRows(selectedStudent!.subjects!.map((s) => ({ subject: s, count: '1' })))
    } else {
      setBulkRows([{ subject: SUBJECTS[0], count: '1' }])
    }
    setEditingPlan(null)
  }

  function handleSaveBulk() {
    if (!bulkRows || !selectedStudentId) return
    const plans = bulkRows
      .map((r) => ({ subject: r.subject, count: parseInt(r.count) || 0 }))
      .filter((r) => r.subject)
    startTransition(async () => {
      await saveStudentPlans(selectedStudentId, termPeriodId, plans)
      setBulkRows(null)
      router.refresh()
    })
  }

  const filteredStudents = students.filter((s) =>
    !studentSearch || s.name.includes(studentSearch) || s.grade.includes(studentSearch)
  )

  return (
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
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{student.name}</p>
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
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-bold text-gray-900 dark:text-gray-100 text-lg">{selectedStudent.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{getDisplayGrade(selectedStudent.grade)}　{termPeriodName}</p>
                </div>
                {/* 科目追加フォーム */}
                {editingPlan ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={editingPlan.subject}
                      onChange={(e) => setEditingPlan({ ...editingPlan, subject: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm"
                    >
                      {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={editingPlan.count}
                      onChange={(e) => setEditingPlan({ ...editingPlan, count: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm w-20"
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
                    <button
                      onClick={() => setEditingPlan(null)}
                      className="text-sm text-gray-400 hover:text-gray-600"
                    >
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
                      onClick={() => { setEditingPlan({ subject: SUBJECTS[0], count: '1' }); setBulkRows(null) }}
                      className="px-3 py-1.5 border border-navy text-navy dark:text-blue-300 text-sm rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      + 1科目だけ追加
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
                    科目ごとのコマ数を入力して保存すると持ちコマとしてカウントされ、自動割り振りのマッチング対象になります
                  </p>
                  <div className="space-y-2">
                    {bulkRows.map((row, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          value={row.subject}
                          onChange={(e) => setBulkRows(bulkRows.map((r, ri) => ri === i ? { ...r, subject: e.target.value } : r))}
                          className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm"
                        >
                          {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={row.count}
                          onChange={(e) => setBulkRows(bulkRows.map((r, ri) => ri === i ? { ...r, count: e.target.value } : r))}
                          className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm w-20"
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400">コマ</span>
                        <button
                          onClick={() => setBulkRows(bulkRows.filter((_, ri) => ri !== i))}
                          className="text-gray-300 hover:text-red-400 text-sm px-1"
                          title="この科目を削除"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => setBulkRows([...bulkRows, { subject: SUBJECTS.find((s) => !bulkRows.some((r) => r.subject === s)) ?? SUBJECTS[0], count: '1' }])}
                      className="text-xs text-navy dark:text-blue-300 hover:underline"
                    >
                      + 科目行を追加
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        合計 {bulkRows.reduce((s, r) => s + (parseInt(r.count) || 0), 0)}コマ
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
              {studentPlans.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  科目ごとのコマ数を設定してください
                </p>
              ) : (
                <div className="space-y-5">
                  {studentPlans.map((plan) => {
                    const subjectLessons = getSubjectLessons(plan.subject)
                    const enrolledCount = enrolledCountBySubject[plan.subject] ?? 0
                    const remaining = plan.planned_count - enrolledCount
                    return (
                      <div key={plan.subject} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                        <div className={[
                          'flex items-center justify-between px-4 py-2.5',
                          remaining <= 0 ? 'bg-green-50 dark:bg-green-950/40' : 'bg-gray-50 dark:bg-gray-900/50',
                        ].join(' ')}>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-800 dark:text-gray-100">{plan.subject}</span>
                            <span className={[
                              'text-sm font-bold px-2 py-0.5 rounded-full',
                              remaining <= 0
                                ? 'bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300'
                                : remaining === plan.planned_count
                                  ? 'bg-gray-200 text-gray-600 dark:text-gray-300'
                                  : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
                            ].join(' ')}>
                              {enrolledCount}/{plan.planned_count}コマ
                              {remaining <= 0 && ' ✓'}
                            </span>
                            {remaining > 0 && (
                              <span className="text-xs text-gray-400">あと{remaining}コマ</span>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeletePlan(plan.subject)}
                            disabled={isPending}
                            className="text-xs text-gray-300 hover:text-red-400 transition-colors"
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
                              const overPlan = !enrolled && enrolledCount >= plan.planned_count
                              const dateLabel = lesson.specific_date
                                ? new Date(lesson.specific_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
                                : `${DAY_NAMES[lesson.day_of_week] ?? ''}曜`
                              const timeLabel = getSlotLabel(lesson.slot_index, lesson.day_of_week, lesson.term_type as any, lesson.type as any)

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
                                    {full && !enrolled && (
                                      <span className="text-[10px] text-red-400">定員満</span>
                                    )}
                                    {overPlan && !enrolled && (
                                      <span className="text-[10px] text-amber-500">予定超過</span>
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
  )
}
