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

interface WeeklyShiftTableProps {
  teachers: Teacher[]
  shifts: Shift[]
  weekDates: string[]   // ['2026-06-15', '2026-06-16', ...] Mon〜Sat
  lessons: Lesson[]
}

const DAY_LABELS = ['月', '火', '水', '木', '金', '土']

function formatTime(t: string) {
  return t.slice(0, 5)  // '16:00:00' → '16:00'
}

function dateToLabel(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

interface ModalState {
  teacherId: string
  teacherName: string
  date: string
  dateLabel: string
  existing?: { id: string; start_time: string; end_time: string }
  lessons: Lesson[]
}

export function WeeklyShiftTable({ teachers, shifts, weekDates, lessons }: WeeklyShiftTableProps) {
  const router = useRouter()
  const [modal, setModal] = useState<ModalState | null>(null)

  // シフトをteacher_id×dateでマップ化
  const shiftMap = new Map<string, Shift>()
  for (const s of shifts) {
    shiftMap.set(`${s.teacher_id}-${s.date}`, s)
  }

  // コマをteacher_id×day_of_weekでマップ化
  const lessonMap = new Map<string, Lesson[]>()
  for (const l of lessons) {
    if (!l.teacher_id) continue
    const key = `${l.teacher_id}-${l.day_of_week}`
    if (!lessonMap.has(key)) lessonMap.set(key, [])
    lessonMap.get(key)!.push(l)
  }

  function openModal(teacher: Teacher, dateStr: string, dateLabel: string) {
    const shift = shiftMap.get(`${teacher.id}-${dateStr}`)
    const date = new Date(dateStr)
    // getDay(): 0=日, 1=月,..., 6=土 → weekDates[0]は月曜=1
    const dow = date.getDay() === 0 ? 7 : date.getDay()
    const dayLessons = lessonMap.get(`${teacher.id}-${dow}`) ?? []
    setModal({
      teacherId: teacher.id,
      teacherName: teacher.name,
      date: dateStr,
      dateLabel: `${dateLabel}（${DAY_LABELS[weekDates.indexOf(dateStr)]}）`,
      existing: shift ? { id: shift.id, start_time: shift.start_time, end_time: shift.end_time } : undefined,
      lessons: dayLessons,
    })
  }

  const handleSaved = useCallback(() => {
    router.refresh()
  }, [router])

  if (teachers.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        先生が登録されていません
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-32 border border-gray-200 bg-gray-50 px-4 py-2 text-left text-xs font-medium text-gray-500">
                先生
              </th>
              {weekDates.map((d, i) => (
                <th
                  key={d}
                  className={[
                    'border border-gray-200 px-3 py-2 text-center text-xs font-semibold',
                    i === 5 ? 'bg-purple-50 text-purple-700' : 'bg-gray-50 text-gray-700',
                  ].join(' ')}
                >
                  <div>{DAY_LABELS[i]}</div>
                  <div className="font-normal text-gray-400">{dateToLabel(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => (
              <tr key={teacher.id} className="hover:bg-gray-50/50">
                <td className="border border-gray-200 px-4 py-3 font-medium text-gray-800 text-sm">
                  {teacher.name}
                </td>
                {weekDates.map((dateStr, i) => {
                  const shift = shiftMap.get(`${teacher.id}-${dateStr}`)
                  const dow = new Date(dateStr).getDay() === 0 ? 7 : new Date(dateStr).getDay()
                  const dayLessons = lessonMap.get(`${teacher.id}-${dow}`) ?? []

                  // コマがシフト外かチェック
                  const hasUncovered = shift
                    ? dayLessons.some((l) => {
                        const slotStart = l.slot_index === 1 ? '16:30' : l.slot_index === 2 ? '18:10' : '19:50'
                        return formatTime(shift.start_time) > slotStart || formatTime(shift.end_time) < slotStart
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
                            <div className={[
                              'text-[10px]',
                              hasUncovered ? 'text-red-500' : 'text-gray-400',
                            ].join(' ')}>
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
