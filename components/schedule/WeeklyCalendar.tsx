'use client'

import { useState, useMemo } from 'react'
import type { Lesson, TermPeriod, TimeSlot } from '@/types'
import {
  REGULAR_SLOTS,
  INTENSIVE_SLOTS,
  GROUP_SATURDAY_SLOTS,
  SATURDAY_INDIVIDUAL_SLOTS,
  DAYS_OF_WEEK,
} from '@/lib/constants/timeSlots'
import { LessonCard } from './LessonCard'
import type { TimeSlotConfig } from '@/app/(dashboard)/settings/actions'

interface ShiftRecord {
  id: string
  teacher_id: string
  date: string
  start_time: string
  end_time: string
}

interface TeacherBasic {
  id: string
  name: string
}

interface WeeklyCalendarProps {
  lessons: Lesson[]
  allLessons?: Lesson[]
  teachers?: TeacherBasic[]
  shifts?: ShiftRecord[]
  termPeriods: TermPeriod[]
  referenceDate: Date
  closureDates?: string[]
  customSlots?: TimeSlotConfig | null
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getTermTypeForDate(date: Date, termPeriods: TermPeriod[]): 'regular' | 'intensive' {
  const dateStr = toDateStr(date)
  const match = termPeriods.find(t => t.start_date <= dateStr && t.end_date >= dateStr)
  return match?.type ?? 'regular'
}

type DayView = 'weekday' | 'saturday'


// シフトがスロット時間をカバーしているか ("HH:MM" 形式で比較)
function shiftCoversSlot(shift: ShiftRecord, slotStart: string, slotEnd: string): boolean {
  const s = shift.start_time.slice(0, 5)
  const e = shift.end_time.slice(0, 5)
  return s <= slotStart && e >= slotEnd
}

export function WeeklyCalendar({
  lessons, allLessons, teachers = [], shifts = [],
  termPeriods, referenceDate,
  closureDates = [],
  customSlots,
}: WeeklyCalendarProps) {
  const [dayView, setDayView] = useState<DayView>('weekday')

  const slots_regular = customSlots?.regular ?? REGULAR_SLOTS
  const slots_intensive = customSlots?.intensive ?? INTENSIVE_SLOTS
  const slots_group_sat = customSlots?.group_saturday ?? GROUP_SATURDAY_SLOTS
  const slots_sat_ind = customSlots?.saturday_individual ?? SATURDAY_INDIVIDUAL_SLOTS

  const monday = useMemo(() => {
    const d = new Date(referenceDate)
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    return d
  }, [referenceDate])

  const termType = getTermTypeForDate(monday, termPeriods)

  const weekDateStrings = useMemo(() => {
    const result: string[] = []
    for (let i = 0; i <= 5; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      result.push(toDateStr(d))
    }
    return result
  }, [monday])

const lessonMap = useMemo(() => {
    const map = new Map<string, Lesson[]>()
    for (const lesson of lessons) {
      if (lesson.lesson_kind === 'temporary') {
        // 臨時コマ: 今週の日付のものだけセルに追加
        if (!lesson.specific_date || !weekDateStrings.includes(lesson.specific_date)) continue
        // term_type チェックなし（特定日コマなので期間区分によらず表示）
      } else {
        if (lesson.term_type !== termType) continue
      }
      let key: string
      if (termType === 'intensive') {
        key = `${lesson.day_of_week}-${lesson.slot_index}`
      } else if (lesson.day_of_week === 6 && lesson.type === 'group') {
        key = `6-g-${lesson.slot_index}`
      } else {
        key = `${lesson.day_of_week}-i-${lesson.slot_index}`
      }
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(lesson)
    }
    return map
  }, [lessons, termType, weekDateStrings])

  // 全コマから「曜日×スロット → 担当中の teacher_id 集合」を作成（フィルター前の全コマで判定）
  const busyTeacherMap = useMemo(() => {
    const base = allLessons ?? lessons
    const map = new Map<string, Set<string>>()
    for (const lesson of base) {
      if (!lesson.teacher_id) continue
      if (lesson.lesson_kind === 'temporary') continue
      if (lesson.term_type !== termType) continue
      const key = `${lesson.day_of_week}-${lesson.slot_index}`
      if (!map.has(key)) map.set(key, new Set())
      map.get(key)!.add(lesson.teacher_id)
    }
    return map
  }, [allLessons, lessons, termType])

  // シフトを date → ShiftRecord[] にマップ
  const shiftByDate = useMemo(() => {
    const map = new Map<string, ShiftRecord[]>()
    for (const s of shifts) {
      if (!map.has(s.date)) map.set(s.date, [])
      map.get(s.date)!.push(s)
    }
    return map
  }, [shifts])

  const weekdays = DAYS_OF_WEEK.filter(d => d.value !== 6)
  const slots = termType === 'intensive' ? slots_intensive : slots_regular

  // 週ナビリンク
  const prevWeekDate = new Date(monday); prevWeekDate.setDate(monday.getDate() - 7)
  const nextWeekDate = new Date(monday); nextWeekDate.setDate(monday.getDate() + 7)
  const monthStr = `${monday.getFullYear()}年${monday.getMonth() + 1}月`
  const weekRange = `${monday.getDate()}日〜${new Date(monday.getTime() + 5 * 86400000).getDate()}日`

  // 土曜の休校
  const isSatClosed = closureDates.includes(weekDateStrings[5])

  return (
    <div>
      {/* ナビ */}
      <div className="flex items-center justify-between mb-3">
        <a href={`/schedule?date=${toDateStr(prevWeekDate)}`}
          className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">
          ‹ 前の週
        </a>
        <span className="text-sm font-semibold text-gray-700">{monthStr} {weekRange}</span>
        <a href={`/schedule?date=${toDateStr(nextWeekDate)}`}
          className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">
          次の週 ›
        </a>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-4">
        {(['weekday', 'saturday'] as DayView[]).map(v => (
          <button key={v} onClick={() => setDayView(v)}
            className={['px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              dayView === v ? 'bg-[#1E3A5F] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            ].join(' ')}>
            {v === 'weekday' ? '月〜金' : '土曜日'}
          </button>
        ))}
      </div>

      {/* 月〜金ビュー */}
      {dayView === 'weekday' && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-36 border border-gray-200 bg-gray-50 px-3 py-3 text-left text-xs text-gray-500 font-medium">
                  時間帯
                </th>
                {weekdays.map((day, i) => {
                  const dateStr = weekDateStrings[i]
                  const isClosed = closureDates.includes(dateStr)
                  const dateObj = new Date(dateStr)
                  const dateLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
                  return (
                    <th key={day.value}
                      className={['border border-gray-200 px-3 py-3 text-center font-semibold',
                        isClosed ? 'bg-red-50 text-red-400' : 'bg-gray-50 text-gray-700',
                      ].join(' ')}>
                      <div className="text-sm">{day.label}曜日</div>
                      <div className="text-xs font-normal opacity-60">{dateLabel}</div>
                      {isClosed && <div className="text-[10px] font-bold text-red-500 mt-0.5">休校</div>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {slots.map(slot => (
                <tr key={slot.index}>
                  <td className="border border-gray-200 bg-gray-50 px-3 py-2.5 whitespace-nowrap">
                    <div className="text-xs font-semibold text-gray-600">第{slot.index}コマ</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{slot.start}〜{slot.end}</div>
                  </td>
                  {weekdays.map((day, i) => {
                    const dateStr = weekDateStrings[i]
                    const isClosed = closureDates.includes(dateStr)
                    const key = termType === 'intensive'
                      ? `${day.value}-${slot.index}`
                      : `${day.value}-i-${slot.index}`
                    const cellLessons = isClosed ? [] : (lessonMap.get(key) ?? [])

                    // 空き先生: その日シフトありかつこのスロット未担当
                    const busySet = busyTeacherMap.get(`${day.value}-${slot.index}`) ?? new Set<string>()
                    const dayShifts = isClosed ? [] : (shiftByDate.get(dateStr) ?? [])
                    const availableTeachers = teachers.filter(t =>
                      !busySet.has(t.id) &&
                      dayShifts.some(s => s.teacher_id === t.id && shiftCoversSlot(s, slot.start, slot.end))
                    )

                    return (
                      <td key={day.value}
                        className={['border border-gray-200 px-2 py-2 align-top',
                          isClosed ? 'bg-red-50/50' : '',
                        ].join(' ')}
                        style={{ minWidth: '190px' }}>
                        {isClosed ? (
                          <div className="h-10 flex items-center justify-center">
                            <span className="text-[11px] text-red-300">休校日</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {cellLessons.map(lesson => (
                              <LessonCard key={lesson.id} lesson={lesson} compact={cellLessons.length >= 3} />
                            ))}
                            {cellLessons.length === 0 && availableTeachers.length === 0 && (
                              <div className="h-10 flex items-center justify-center">
                                <span className="text-[10px] text-gray-300">—</span>
                              </div>
                            )}
                            {availableTeachers.length > 0 && (
                              <div className={['flex flex-wrap gap-1', cellLessons.length > 0 ? 'pt-1 mt-1 border-t border-gray-200' : ''].join(' ')}>
                                {availableTeachers.map(t => (
                                  <span key={t.id} className="text-[10px] bg-blue-50 text-blue-600 border border-dashed border-blue-300 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                    {t.name}
                                  </span>
                                ))}
                              </div>
                            )}
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
      )}

      {/* 土曜ビュー */}
      {dayView === 'saturday' && (
        <div className="overflow-x-auto">
          {isSatClosed && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
              今週の土曜日（{weekDateStrings[5]?.replace(/-/g, '/')}）は休校日です
            </div>
          )}
          {termType === 'intensive' ? (
            <table className="border-collapse text-sm" style={{ minWidth: '400px' }}>
              <thead>
                <tr>
                  <th className="w-36 border border-gray-200 bg-gray-50 px-3 py-3 text-left text-xs text-gray-500 font-medium">時間帯</th>
                  <th className={['border border-gray-200 px-3 py-3 text-center text-sm font-semibold',
                    isSatClosed ? 'bg-red-50 text-red-400' : 'bg-purple-50 text-purple-800'].join(' ')}
                    style={{ minWidth: '300px' }}>
                    土曜日
                    {isSatClosed && <div className="text-[10px] font-bold text-red-500">休校</div>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {slots_intensive.map(slot => {
                  const cellLessons = isSatClosed ? [] : (lessonMap.get(`6-${slot.index}`) ?? [])
                  return (
                    <tr key={slot.index}>
                      <td className="border border-gray-200 bg-gray-50 px-3 py-2.5 whitespace-nowrap">
                        <div className="text-xs font-semibold text-gray-600">第{slot.index}コマ</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{slot.start}〜{slot.end}</div>
                      </td>
                      <td className={['border border-gray-200 px-2 py-2 align-top', isSatClosed ? 'bg-red-50/50' : ''].join(' ')}
                        style={{ minHeight: '80px' }}>
                        <div className="space-y-1">
                          {cellLessons.map(l => <LessonCard key={l.id} lesson={l} compact={cellLessons.length >= 3} />)}
                          {cellLessons.length === 0 && !isSatClosed && (
                            <div className="h-10 flex items-center justify-center">
                              <span className="text-[10px] text-gray-300">—</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="space-y-4" style={{ minWidth: '320px' }}>
              {/* 個別指導 */}
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-36 border border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs text-gray-500 font-medium">時間帯</th>
                    <th className="border border-gray-200 bg-teal-50 px-3 py-2.5 text-center text-sm font-semibold text-teal-800">個別指導</th>
                  </tr>
                </thead>
                <tbody>
                  {slots_sat_ind.map(slot => {
                    const key = `6-i-${slot.index}`
                    const cellLessons = isSatClosed ? [] : (lessonMap.get(key) ?? [])
                    return (
                      <tr key={slot.index}>
                        <td className="border border-gray-200 bg-gray-50 px-3 py-2.5 whitespace-nowrap">
                          <div className="text-xs font-semibold text-gray-600">第{slot.index}コマ</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">{slot.start}〜{slot.end}</div>
                        </td>
                        <td className={['border border-gray-200 px-2 py-2 align-top', isSatClosed ? 'bg-red-50/50' : ''].join(' ')}
                          style={{ minHeight: '72px' }}>
                          <div className="space-y-1">
                            {cellLessons.map(l => <LessonCard key={l.id} lesson={l} compact={cellLessons.length >= 3} />)}
                            {cellLessons.length === 0 && !isSatClosed && (
                              <div className="h-10 flex items-center justify-center">
                                <span className="text-[10px] text-gray-300">—</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* 集団授業 */}
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-36 border border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs text-gray-500 font-medium">時間帯</th>
                    <th className="border border-gray-200 bg-purple-50 px-3 py-2.5 text-center text-sm font-semibold text-purple-800">集団授業</th>
                  </tr>
                </thead>
                <tbody>
                  {slots_group_sat.map(slot => {
                    const key = `6-g-${slot.index}`
                    const cellLessons = isSatClosed ? [] : (lessonMap.get(key) ?? [])
                    return (
                      <tr key={slot.index}>
                        <td className="border border-gray-200 bg-gray-50 px-3 py-2.5 whitespace-nowrap">
                          <div className="text-xs font-semibold text-gray-600">第{slot.index}コマ</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">{slot.start}〜{slot.end}</div>
                        </td>
                        <td className={['border border-gray-200 px-2 py-2 align-top', isSatClosed ? 'bg-red-50/50' : ''].join(' ')}
                          style={{ minHeight: '72px' }}>
                          <div className="space-y-1">
                            {cellLessons.map(l => <LessonCard key={l.id} lesson={l} compact={cellLessons.length >= 3} />)}
                            {cellLessons.length === 0 && !isSatClosed && (
                              <div className="h-10 flex items-center justify-center">
                                <span className="text-[10px] text-gray-300">—</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
