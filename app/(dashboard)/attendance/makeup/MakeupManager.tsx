'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { assignMakeup } from '@/app/(dashboard)/attendance/actions'
import { getSlotLabel } from '@/lib/constants/timeSlots'
import { DAYS_OF_WEEK } from '@/lib/constants/timeSlots'
import { getDisplayGrade } from '@/lib/utils/grade'

interface StudentInfo {
  id: string
  name: string
  grade: string
  subjects: string[]
  preferred_teacher_ids: string[]
  ng_teacher_ids: string[]
}

interface TeacherInfo {
  id: string
  name: string
  subjects: string[]
}

interface Lesson {
  id: string
  title: string
  subject: string
  type: 'group' | 'individual'
  day_of_week: number
  slot_index: number
  term_type: 'regular' | 'intensive'
  teacher_id: string | null
  teacher?: TeacherInfo | null
  booth?: { id: string; name: string } | null
  enrollments?: { id: string }[]
  capacity: number
}

interface Credit {
  id: string
  student_id: string
  total_credits: number
  used_credits: number
  expires_at?: string | null
  student: StudentInfo | null
}

interface Shift {
  id: string
  teacher_id: string
  date: string
  start_time: string
  end_time: string
}

interface MakeupManagerProps {
  credits: Credit[]
  lessons: Lesson[]
  shifts: Shift[]
}

// Returns a score + metadata for the lesson relative to the student
function scoreLessonForStudent(
  lesson: Lesson,
  student: StudentInfo,
  date: string,
  shifts: Shift[]
): { score: number; isPreferred: boolean; isNg: boolean; subjectMatch: boolean; hasShift: boolean } {
  const teacherId = lesson.teacher_id
  const isNg = teacherId ? student.ng_teacher_ids.includes(teacherId) : false
  const isPreferred = teacherId ? student.preferred_teacher_ids.includes(teacherId) : false

  const teacherSubjects: string[] = (lesson.teacher as TeacherInfo | null | undefined)?.subjects ?? []
  const subjectMatch = student.subjects.some((s) => teacherSubjects.includes(s))

  // Check shift coverage for the date
  let hasShift = false
  if (teacherId && date) {
    const shift = shifts.find((s) => s.teacher_id === teacherId && s.date === date)
    if (shift) hasShift = true
  }

  let score = 0
  if (subjectMatch) score += 2
  if (hasShift) score += 2
  if (isPreferred) score += 3

  return { score, isPreferred, isNg, subjectMatch, hasShift }
}

export function MakeupManager({ credits, lessons, shifts }: MakeupManagerProps) {
  const router = useRouter()
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState('')
  const [assignedDate, setAssignedDate] = useState(new Date().toISOString().split('T')[0])
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  const student = selectedCredit?.student ?? null

  // Compute scored lessons whenever student/date changes
  const scoredLessons = useMemo(() => {
    if (!student) return lessons
      .map((l) => ({ lesson: l, score: 0, isPreferred: false, isNg: false, subjectMatch: false, hasShift: false, isFull: (l.enrollments?.length ?? 0) >= l.capacity }))
    return lessons
      .map((l) => ({
        lesson: l,
        isFull: (l.enrollments?.length ?? 0) >= l.capacity,
        ...scoreLessonForStudent(l, student, assignedDate, shifts),
      }))
      .filter((x) => !x.isNg)
      .sort((a, b) => {
        if (a.isFull !== b.isFull) return a.isFull ? 1 : -1
        return b.score - a.score
      })
  }, [student, assignedDate, lessons, shifts])

  function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCredit || !selectedLessonId) return
    setError(undefined)
    startTransition(async () => {
      const result = await assignMakeup(selectedCredit.student_id, selectedLessonId, assignedDate)
      if (result.error) { setError(result.error); return }
      setSelectedCredit(null)
      setSelectedLessonId('')
      router.refresh()
    })
  }

  const dayLabel = (dow: number) =>
    DAYS_OF_WEEK.find((d) => d.value === dow)?.label ?? ''

  if (credits.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-12 text-center">
        <p className="text-gray-400 text-sm">振替クレジットが残っている生徒はいません</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 振替クレジット一覧 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">振替クレジット残数</h2>
        <div className="space-y-2">
          {credits.map((credit) => {
            const remaining = credit.total_credits - credit.used_credits
            const isSelected = selectedCredit?.id === credit.id
            return (
              <button
                key={credit.id}
                onClick={() => {
                  setSelectedCredit(isSelected ? null : credit)
                  setSelectedLessonId('')
                }}
                className={[
                  'w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors',
                  isSelected
                    ? 'border-navy bg-blue-50 dark:bg-blue-950/40'
                    : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-navy shadow-sm',
                ].join(' ')}
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{credit.student?.name}</p>
                  <p className="text-xs text-gray-400">{credit.student?.grade ? getDisplayGrade(credit.student.grade) : ''}</p>
                  {(credit.student?.subjects?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {credit.student?.subjects?.map((s) => (
                        <span key={s} className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    {Array.from({ length: Math.min(remaining, 5) }).map((_, i) => (
                      <span key={i} className="inline-block w-3 h-3 rounded-full bg-amber-brand" />
                    ))}
                    <span className="text-sm font-bold text-amber-brand ml-1">{remaining}</span>
                    <span className="text-xs text-gray-400">残</span>
                  </div>
                  {credit.expires_at && (
                    <p className={[
                      'text-[10px] mt-0.5',
                      new Date(credit.expires_at) < new Date(Date.now() + 14 * 86400000)
                        ? 'text-red-500 font-medium'
                        : 'text-gray-400',
                    ].join(' ')}>
                      期限 {new Date(credit.expires_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 振替コマ割り当て */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
          {selectedCredit
            ? `${selectedCredit.student?.name}さんの振替コマを割り当て`
            : '生徒を選択してください'}
        </h2>

        {selectedCredit ? (
          <form onSubmit={handleAssign} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">振替日</label>
              <input
                type="date"
                required
                value={assignedDate}
                onChange={(e) => { setAssignedDate(e.target.value); setSelectedLessonId('') }}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">振替コマ</label>
                {student && (
                  <span className="text-[10px] text-gray-400">
                    {student.ng_teacher_ids.length > 0 && 'NG先生のコマを除外 '}
                    ⭐=任せたい先生 ✓=科目一致
                  </span>
                )}
              </div>

              {scoredLessons.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">条件に合うコマがありません</p>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {(() => {
                    const recommended = scoredLessons.filter((x) => x.score > 0 && !x.isFull)
                    const others = scoredLessons.filter((x) => x.score === 0 || x.isFull)
                    const LessonButton = ({ lesson, isPreferred, subjectMatch, hasShift, isFull }: typeof scoredLessons[0]) => {
                      const slotLabel = getSlotLabel(lesson.slot_index, lesson.day_of_week, lesson.term_type, lesson.type)
                      const isSelected = selectedLessonId === lesson.id
                      const enrolled = lesson.enrollments?.length ?? 0
                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => !isFull && setSelectedLessonId(isSelected ? '' : lesson.id)}
                          disabled={isFull}
                          className={[
                            'w-full flex items-start justify-between px-3 py-2 rounded-lg border text-left text-sm transition-colors',
                            isFull
                              ? 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 opacity-50 cursor-not-allowed'
                              : isSelected
                                ? 'border-navy bg-blue-50 dark:bg-blue-950/40'
                                : isPreferred
                                  ? 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 hover:border-amber-400'
                                  : 'border-gray-100 dark:border-gray-700 hover:border-gray-300',
                          ].join(' ')}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {isPreferred && <span title="任せたい先生">⭐</span>}
                              <span className="font-medium text-gray-800 dark:text-gray-100">
                                第{lesson.slot_index}コマ　{lesson.teacher?.name ? `${lesson.teacher.name}先生` : '担当未設定'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {lesson.booth?.name && (
                                <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full">{lesson.booth.name}</span>
                              )}
                              {subjectMatch && (
                                <span className="text-[10px] bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full">✓ 科目一致</span>
                              )}
                              {hasShift && (
                                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">シフトあり</span>
                              )}
                              {isFull && (
                                <span className="text-[10px] bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-300 px-1.5 py-0.5 rounded-full">定員満</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-400 ml-2 shrink-0">
                            <p>{dayLabel(lesson.day_of_week)}曜</p>
                            <p>{slotLabel}</p>
                            <p className={isFull ? 'text-red-400' : 'text-gray-400'}>{enrolled}/{lesson.capacity}名</p>
                          </div>
                        </button>
                      )
                    }
                    return (
                      <>
                        {recommended.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-300 mb-1 flex items-center gap-1">
                              ⭐ おすすめ（{recommended.length}件）
                            </p>
                            <div className="space-y-1">
                              {recommended.map((x) => <LessonButton key={x.lesson.id} {...x} />)}
                            </div>
                          </div>
                        )}
                        {others.length > 0 && (
                          <div>
                            {recommended.length > 0 && (
                              <p className="text-[10px] font-semibold text-gray-400 mb-1">その他（{others.length}件）</p>
                            )}
                            <div className="space-y-1">
                              {others.map((x) => <LessonButton key={x.lesson.id} {...x} />)}
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                loading={isPending}
                disabled={!selectedLessonId}
                className="flex-1"
              >
                振替を割り当てる
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelectedCredit(null)}
              >
                キャンセル
              </Button>
            </div>
          </form>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-10 text-center text-gray-400 text-sm">
            左から生徒を選択すると<br />振替コマを割り当てられます
          </div>
        )}
      </div>
    </div>
  )
}
