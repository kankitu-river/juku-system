'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Lesson, Teacher, Student, TermPeriod } from '@/types'
import { WeeklyCalendar } from './WeeklyCalendar'
import type { TimeSlotConfig } from '@/app/(dashboard)/settings/actions'
import { getDisplayGrade } from '@/lib/utils/grade'
import { getSlotLabel } from '@/lib/constants/timeSlots'
import { toDateStr } from '@/lib/utils/datetime'

interface Shift {
  id: string
  teacher_id: string
  date: string
  start_time: string
  end_time: string
}

interface MakeupAssignment {
  id: string
  lesson_id: string
  assigned_date: string
  student: { id: string; name: string } | null
}

interface ScheduleFilterProps {
  lessons: Lesson[]
  teachers: Teacher[]
  students: Student[]
  termPeriods: TermPeriod[]
  referenceDate: Date
  closureDates: string[]
  customSlots: TimeSlotConfig | null
  shifts: Shift[]
  makeupAssignments?: MakeupAssignment[]
}

function getTermTypeForDate(date: Date, termPeriods: TermPeriod[]): 'regular' | 'intensive' {
  const dateStr = toDateStr(date)
  const match = termPeriods.find(t => t.start_date <= dateStr && t.end_date >= dateStr)
  return match?.type ?? 'regular'
}

const DAY_LABELS: Record<number, string> = { 0: '日', 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' }

export function ScheduleFilter({
  lessons,
  teachers,
  students,
  termPeriods,
  referenceDate,
  closureDates,
  customSlots,
  shifts,
  makeupAssignments = [],
}: ScheduleFilterProps) {
  const [teacherFilter, setTeacherFilter] = useState('')
  const [studentFilter, setStudentFilter] = useState('')

  // 現在の週の期間区分
  const monday = useMemo(() => {
    const d = new Date(referenceDate)
    const day = d.getDay()
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
    return d
  }, [referenceDate])
  const currentTermType = getTermTypeForDate(monday, termPeriods)
  const otherTermType = currentTermType === 'regular' ? 'intensive' : 'regular'

  const filtered = useMemo(() => {
    let result = lessons
    if (teacherFilter) result = result.filter((l) => l.teacher_id === teacherFilter)
    if (studentFilter) result = result.filter((l) => l.enrollments?.some((e) => e.student_id === studentFilter))
    return result
  }, [lessons, teacherFilter, studentFilter])

  // 現在の期間区分と異なるコマ（カレンダーに表示されない）
  const hiddenLessons = useMemo(() => {
    if (!teacherFilter && !studentFilter) return []
    return filtered.filter(
      (l) => l.lesson_kind !== 'temporary' && l.term_type === otherTermType
    )
  }, [filtered, teacherFilter, studentFilter, otherTermType])

  const isFiltered = teacherFilter || studentFilter

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <select
          value={teacherFilter}
          onChange={(e) => setTeacherFilter(e.target.value)}
          className={[
            'border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy transition-colors',
            teacherFilter ? 'border-navy bg-blue-50 dark:bg-blue-950/40 text-navy dark:text-blue-300' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800',
          ].join(' ')}
        >
          <option value="">先生で絞り込み</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select
          value={studentFilter}
          onChange={(e) => setStudentFilter(e.target.value)}
          className={[
            'border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy transition-colors',
            studentFilter ? 'border-navy bg-blue-50 dark:bg-blue-950/40 text-navy dark:text-blue-300' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800',
          ].join(' ')}
        >
          <option value="">生徒で絞り込み</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}（{getDisplayGrade(s.grade)}）</option>
          ))}
        </select>

        {isFiltered && (
          <button
            onClick={() => { setTeacherFilter(''); setStudentFilter('') }}
            className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            絞り込み解除
          </button>
        )}

        {isFiltered && (
          <span className="text-xs text-navy dark:text-blue-300 font-medium">
            {filtered.length}コマ表示中
          </span>
        )}
      </div>

      <WeeklyCalendar
        lessons={filtered}
        allLessons={lessons}
        teachers={teachers}
        shifts={shifts}
        termPeriods={termPeriods}
        referenceDate={referenceDate}
        closureDates={closureDates}
        customSlots={customSlots}
        makeupAssignments={makeupAssignments}
      />

      {/* 現在の期間区分と異なるコマ（カレンダーに出ないもの）*/}
      {hiddenLessons.length > 0 && (
        <div className="mt-5 border-t border-amber-200 dark:border-amber-900 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              ⚠ このカレンダーに表示されていないコマ（{otherTermType === 'intensive' ? '講習期間' : '通常期間'}のコマ）
            </span>
            <span className="text-xs text-amber-500">
              {otherTermType === 'intensive' ? '講習期間' : '通常期間'}の週に移動すると表示されます
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {hiddenLessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/schedule/${lesson.id}`}
                className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 hover:border-amber-400 transition-colors"
              >
                <div className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-amber-200 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                    {DAY_LABELS[lesson.day_of_week]}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    第{lesson.slot_index}コマ　{lesson.teacher ? (lesson.teacher as { name: string }).name + '先生' : '担当未設定'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {getSlotLabel(lesson.slot_index, lesson.day_of_week, lesson.term_type, lesson.type)}
                  </p>
                </div>
                <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 rounded-full whitespace-nowrap self-start">
                  {otherTermType === 'intensive' ? '講習' : '通常'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
