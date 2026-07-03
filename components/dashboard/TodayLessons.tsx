'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { recordAttendance, markAbsentWithCredit, markAbsentNoCredit } from '@/app/(dashboard)/attendance/actions'
import { getDisplayGrade } from '@/lib/utils/grade'
import { getSlotsForLesson } from '@/lib/constants/timeSlots'

interface Student {
  id: string
  name: string
  grade: string
}

interface Attendance {
  student_id: string
  status: 'present' | 'absent' | 'makeup_used'
}

interface Lesson {
  id: string
  title: string
  subject: string
  type: string
  slot_index: number
  teacher: { name: string } | null
  notes: string | null
  enrollments: { student: Student | null }[]
  attendances: Attendance[]
}

interface TodayLessonsProps {
  lessons: Lesson[]
  todayStr: string
  dayOfWeek?: number
  termType?: 'regular' | 'intensive'
}

function jstTimeNow(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
}

interface AbsentDialog {
  studentId: string
  studentName: string
  lessonId: string
}

const STATUS_LABEL: Record<string, string> = {
  present: '出席',
  absent: '欠席',
  makeup_used: '振替',
}
const STATUS_COLOR: Record<string, string> = {
  present: 'bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 border-green-300 dark:border-green-800',
  absent: 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800',
  makeup_used: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800',
}

export function TodayLessons({ lessons, todayStr, dayOfWeek = new Date().getDay(), termType = 'regular' }: TodayLessonsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [absentDialog, setAbsentDialog] = useState<AbsentDialog | null>(null)
  const [localAttendances, setLocalAttendances] = useState<Record<string, Record<string, string>>>({})
  // 「進行中」判定はクライアント時刻で行う（SSRとのズレを避けるためマウント後に設定）
  const [now, setNow] = useState<string | null>(null)

  useEffect(() => {
    setNow(jstTimeNow())
    const timer = setInterval(() => setNow(jstTimeNow()), 60_000)
    return () => clearInterval(timer)
  }, [])

  function getStatus(lessonId: string, studentId: string, attendances: Attendance[]) {
    if (localAttendances[lessonId]?.[studentId]) return localAttendances[lessonId][studentId]
    return attendances.find((a) => a.student_id === studentId)?.status ?? null
  }

  function handlePresent(lessonId: string, studentId: string) {
    startTransition(async () => {
      await recordAttendance(studentId, lessonId, todayStr, 'present')
      setLocalAttendances((prev) => ({
        ...prev,
        [lessonId]: { ...prev[lessonId], [studentId]: 'present' },
      }))
      router.refresh()
    })
  }

  function handleAbsent(lessonId: string, studentId: string, studentName: string) {
    setAbsentDialog({ studentId, studentName, lessonId })
  }

  function confirmAbsent(withCredit: boolean) {
    if (!absentDialog) return
    const { studentId, lessonId } = absentDialog
    setAbsentDialog(null)
    startTransition(async () => {
      if (withCredit) {
        await markAbsentWithCredit(studentId, lessonId, todayStr)
      } else {
        await markAbsentNoCredit(studentId, lessonId, todayStr)
      }
      setLocalAttendances((prev) => ({
        ...prev,
        [lessonId]: { ...prev[lessonId], [studentId]: 'absent' },
      }))
      router.refresh()
    })
  }

  if (lessons.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-gray-400">
        <svg className="w-10 h-10 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">今日のコマはありません</p>
      </div>
    )
  }

  // スロットごとにグループ化して「進行中」「次」を判定
  const slotGroups: { slotIndex: number; start: string; end: string; lessons: Lesson[] }[] = []
  for (const lesson of lessons) {
    let group = slotGroups.find((g) => g.slotIndex === lesson.slot_index)
    if (!group) {
      const slots = getSlotsForLesson(
        lesson.type === 'group' ? 'group' : 'individual', dayOfWeek, termType
      )
      const slot = slots.find((s) => s.index === lesson.slot_index)
      group = { slotIndex: lesson.slot_index, start: slot?.start ?? '', end: slot?.end ?? '', lessons: [] }
      slotGroups.push(group)
    }
    group.lessons.push(lesson)
  }
  slotGroups.sort((a, b) => a.slotIndex - b.slotIndex)
  const currentIdx = now ? slotGroups.findIndex((g) => g.start && now >= g.start && now <= g.end) : -1
  const nextIdx = now ? slotGroups.findIndex((g) => g.start && g.start > now) : -1

  return (
    <>
      {slotGroups.map((group, gi) => (
        <div key={group.slotIndex}>
          <div className={[
            'px-5 py-2 border-y border-gray-100 dark:border-gray-700 flex items-center gap-2 text-xs font-semibold',
            gi === currentIdx
              ? 'bg-amber-50 dark:bg-amber-950/40 border-l-4 border-l-amber-brand text-amber-900'
              : 'bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300',
          ].join(' ')}>
            第{group.slotIndex}コマ
            {group.start && (
              <span className="font-normal opacity-60">{group.start}〜{group.end}</span>
            )}
            {gi === currentIdx && (
              <span className="bg-amber-brand text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">進行中</span>
            )}
            {gi === nextIdx && gi !== currentIdx && (
              <span className="bg-gray-200 text-gray-500 dark:text-gray-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">次</span>
            )}
          </div>
          <ul className="divide-y divide-gray-50 dark:divide-gray-700">
        {group.lessons.map((lesson) => {
          const students = lesson.enrollments.map((e) => e.student).filter(Boolean) as Student[]
          return (
            <li key={lesson.id} className="px-5 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={[
                  'w-2 h-10 rounded-full flex-shrink-0',
                  lesson.type === 'group' ? 'bg-purple-400' : 'bg-teal-400',
                ].join(' ')} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    第{lesson.slot_index}コマ　{lesson.teacher?.name ? `${lesson.teacher.name}先生` : '担当未設定'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {lesson.type === 'group' ? '集団授業' : '個別指導'}
                  </p>
                  {lesson.notes && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">📝 {lesson.notes}</p>
                  )}
                </div>
                <Link
                  href={`/attendance/${lesson.id}`}
                  className="text-xs text-navy dark:text-blue-300 hover:underline flex-shrink-0"
                >
                  詳細 →
                </Link>
              </div>

              {students.length > 0 ? (
                <div className="ml-5 space-y-1.5">
                  {students.map((student) => {
                    const status = getStatus(lesson.id, student.id, lesson.attendances)
                    return (
                      <div key={student.id} className="flex items-center gap-2">
                        <span className="text-sm text-gray-700 dark:text-gray-300 w-28 truncate">{student.name}</span>
                        <span className="text-xs text-gray-400">{getDisplayGrade(student.grade)}</span>
                        <div className="flex items-center gap-1 ml-auto">
                          {status ? (
                            <span className={[
                              'text-xs px-2 py-0.5 rounded-full border font-medium',
                              STATUS_COLOR[status] ?? '',
                            ].join(' ')}>
                              {STATUS_LABEL[status]}
                            </span>
                          ) : null}
                          <button
                            onClick={() => handlePresent(lesson.id, student.id)}
                            disabled={isPending || status === 'present'}
                            className={[
                              'text-xs px-2.5 py-1 rounded-lg border transition-colors',
                              status === 'present'
                                ? 'bg-green-500 text-white border-green-500'
                                : 'bg-white dark:bg-gray-800 text-green-700 dark:text-green-300 border-green-300 dark:border-green-800 hover:bg-green-50',
                            ].join(' ')}
                          >
                            出席
                          </button>
                          <button
                            onClick={() => handleAbsent(lesson.id, student.id, student.name)}
                            disabled={isPending || status === 'absent'}
                            className={[
                              'text-xs px-2.5 py-1 rounded-lg border transition-colors',
                              status === 'absent'
                                ? 'bg-red-500 text-white border-red-500'
                                : 'bg-white dark:bg-gray-800 text-red-600 dark:text-red-300 border-red-300 dark:border-red-800 hover:bg-red-50',
                            ].join(' ')}
                          >
                            欠席
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="ml-5 text-xs text-gray-400">生徒未登録</p>
              )}
            </li>
          )
        })}
          </ul>
        </div>
      ))}

      {/* 欠席確認ダイアログ */}
      {absentDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80 mx-4">
            <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">欠席を記録</p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
              <span className="font-medium">{absentDialog.studentName}</span> さんの振替クレジットを追加しますか？
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => confirmAbsent(true)}
                className="w-full py-2.5 rounded-xl bg-navy text-white text-sm font-medium hover:bg-navy-dark transition-colors"
              >
                振替を追加する
              </button>
              <button
                onClick={() => confirmAbsent(false)}
                className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                追加しない（欠席のみ）
              </button>
              <button
                onClick={() => setAbsentDialog(null)}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
