'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Teacher, Lesson } from '@/types'
import { ShiftModal } from './ShiftModal'

interface Shift {
  id: string
  teacher_id: string
  date: string
  start_time: string
  end_time: string
}

interface TermPeriodLite {
  start_date: string
  end_date: string
  type: 'regular' | 'intensive'
}

interface WeeklyShiftTableProps {
  teachers: Teacher[]
  shifts: Shift[]
  weekDates: string[]   // ['2026-06-15', ...] Mon〜Sat
  lessons: Lesson[]
  termPeriods?: TermPeriodLite[]
}

const DAY_LABELS = ['月', '火', '水', '木', '金', '土']

const REGULAR_SLOT_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: '16:30', end: '18:00' },
  2: { start: '18:10', end: '19:40' },
  3: { start: '19:50', end: '21:20' },
}
const INTENSIVE_SLOT_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: '09:30', end: '11:00' },
  2: { start: '11:10', end: '12:40' },
  3: { start: '13:10', end: '14:40' },
  4: { start: '14:50', end: '16:20' },
  5: { start: '16:30', end: '18:00' },
  6: { start: '18:10', end: '19:40' },
  7: { start: '19:50', end: '21:20' },
}

function formatTime(t: string) {
  return t.slice(0, 5)
}

function dateToLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function getTermTypeForDate(dateStr: string, termPeriods: TermPeriodLite[]): 'regular' | 'intensive' {
  const found = termPeriods.find((t) => t.start_date <= dateStr && t.end_date >= dateStr)
  return found?.type ?? 'regular'
}

interface ModalState {
  teacherId: string
  teacherName: string
  date: string
  dateLabel: string
  existing?: { id: string; start_time: string; end_time: string }
  lessons: Lesson[]
}

export function WeeklyShiftTable({ teachers, shifts, weekDates, lessons, termPeriods = [] }: WeeklyShiftTableProps) {
  const router = useRouter()
  const [modal, setModal] = useState<ModalState | null>(null)

  const shiftMap = new Map<string, Shift>()
  for (const s of shifts) {
    shiftMap.set(`${s.teacher_id}-${s.date}`, s)
  }

  // term_type を含めてキーを作成し、混在を防ぐ
  const lessonMap = new Map<string, Lesson[]>()
  for (const l of lessons) {
    if (!l.teacher_id) continue
    const tt = (l.term_type as string) || 'regular'
    const key = `${l.teacher_id}-${l.day_of_week}-${tt}`
    if (!lessonMap.has(key)) lessonMap.set(key, [])
    lessonMap.get(key)!.push(l)
  }

  function openModal(teacher: Teacher, dateStr: string, dateLabel: string) {
    const shift = shiftMap.get(`${teacher.id}-${dateStr}`)
    const d = new Date(dateStr + 'T12:00:00')
    const dow = d.getDay()
    const termType = getTermTypeForDate(dateStr, termPeriods)
    const dayLessons = lessonMap.get(`${teacher.id}-${dow}-${termType}`) ?? []
    setModal({
      teacherId: teacher.id,
      teacherName: teacher.name,
      date: dateStr,
      dateLabel: `${dateLabel}（${DAY_LABELS[weekDates.indexOf(dateStr)]}）`,
      existing: shift ? { id: shift.id, start_time: shift.start_time, end_time: shift.end_time } : undefined,
      lessons: dayLessons,
    })
  }

  const handleSaved = useCallback(() => { router.refresh() }, [router])

  if (teachers.length === 0) {
    return <div className="text-center py-10 text-gray-400 text-sm">先生が登録されていません</div>
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-32 border border-gray-200 bg-gray-50 px-4 py-2 text-left text-xs font-medium text-gray-500">先生</th>
              {weekDates.map((d, i) => {
                const termType = getTermTypeForDate(d, termPeriods)
                return (
                  <th
                    key={d}
                    className={[
                      'border border-gray-200 px-3 py-2 text-center text-xs font-semibold',
                      i === 5 ? 'bg-purple-50 text-purple-700' : 'bg-gray-50 text-gray-700',
                    ].join(' ')}
                  >
                    <div>{DAY_LABELS[i]}</div>
                    <div className="font-normal text-gray-400">{dateToLabel(d)}</div>
                    {termType === 'intensive' && (
                      <div className="text-[9px] font-bold text-amber-600 bg-amber-50 rounded px-1 mt-0.5 inline-block">講習</div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => (
              <tr key={teacher.id} className="hover:bg-gray-50/50">
                <td className="border border-gray-200 px-4 py-3 font-medium text-gray-800 text-sm">{teacher.name}</td>
                {weekDates.map((dateStr, i) => {
                  const shift = shiftMap.get(`${teacher.id}-${dateStr}`)
                  const d = new Date(dateStr + 'T12:00:00')
                  const dow = d.getDay()
                  const termType = getTermTypeForDate(dateStr, termPeriods)
                  const dayLessons = lessonMap.get(`${teacher.id}-${dow}-${termType}`) ?? []

                  const slotTimes = termType === 'intensive' ? INTENSIVE_SLOT_TIMES : REGULAR_SLOT_TIMES
                  const hasUncovered = shift
                    ? dayLessons.some((l) => {
                        const st = slotTimes[l.slot_index]
                        if (!st) return false
                        return formatTime(shift.start_time) > st.start || formatTime(shift.end_time) < st.end
                      })
                    : dayLessons.length > 0

                  return (
                    <td
                      key={dateStr}
                      className={[
                        'border border-gray-200 px-2 py-2 text-center cursor-pointer transition-colors',
                        i === 5 ? 'bg-purple-50/20' : '',
                        shift ? 'hover:bg-green-50' : 'hover:bg-blue-50',
                      ].join(' ')}
                      onClick={() => openModal(teacher, dateStr, dateToLabel(dateStr))}
                    >
                      {shift ? (
                        <div className="space-y-0.5">
                          <div className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                            {formatTime(shift.start_time)}〜{formatTime(shift.end_time)}
                          </div>
                          {dayLessons.length > 0 && (
                            <div className={['text-[10px]', hasUncovered ? 'text-red-500' : 'text-gray-400'].join(' ')}>
                              {hasUncovered ? '⚠ コマ外れ' : `コマ${dayLessons.length}件`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-gray-300 text-xs">
                          {dayLessons.length > 0
                            ? <span className="text-amber-400 font-medium">⚠ 未登録</span>
                            : '—'}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <ShiftModal
          open={true}
          onClose={() => setModal(null)}
          teacherId={modal.teacherId}
          teacherName={modal.teacherName}
          date={modal.date}
          dateLabel={modal.dateLabel}
          existing={modal.existing}
          lessons={modal.lessons}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
