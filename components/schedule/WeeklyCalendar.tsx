'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import { toDateStr } from '@/lib/utils/datetime'

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

interface MakeupAssignment {
  id: string
  lesson_id: string
  assigned_date: string
  student: { id: string; name: string } | null
  kind?: 'makeup' | 'temporary'
  subject?: string
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
  makeupAssignments?: MakeupAssignment[]
  absences?: AbsenceRecord[]
  teacherOverrides?: TeacherOverride[]
}

interface AbsenceRecord {
  lesson_id: string
  student_id: string
  date: string
}

interface TeacherOverride {
  lesson_id: string
  date: string
  teacher_name: string | null
}

function getTermTypeForDate(date: Date, termPeriods: TermPeriod[]): 'regular' | 'intensive' {
  const dateStr = toDateStr(date)
  const match = termPeriods.find(t => t.start_date <= dateStr && t.end_date >= dateStr)
  return match?.type ?? 'regular'
}

// 週（月〜土）のいずれかが講習期間に重なれば intensive とみなす。
// 講習が週の途中から始まる/終わる移行週で、月曜だけで判定すると期間区分がずれるため。
function getWeekTermType(monday: Date, termPeriods: TermPeriod[]): 'regular' | 'intensive' {
  for (let i = 0; i <= 5; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    if (getTermTypeForDate(d, termPeriods) === 'intensive') return 'intensive'
  }
  return 'regular'
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
  makeupAssignments = [],
  absences = [],
  teacherOverrides = [],
}: WeeklyCalendarProps) {
  const router = useRouter()
  const [dayView, setDayView] = useState<DayView>('weekday')
  const [density, setDensity] = useState<'full' | 'compact'>('full')
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null)
  // モバイル（lg未満）では1日分だけ表示する。初期値は今日（土日は月曜）
  const [mobileDay, setMobileDay] = useState<number>(() => {
    const d = new Date().getDay()
    return d >= 1 && d <= 5 ? d : 1
  })

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

  const termType = getWeekTermType(monday, termPeriods)

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

  // 臨時コマは日付固有なので「日付×スロット → 担当中 teacher_id」で別途判定する。
  // busyTeacherMap は曜日ベースで臨時コマを含まないため、これがないと
  // 既に臨時コマを持つ先生が「待機」として表示され、追加保存時に重複エラーになる。
  const tempBusyByDate = useMemo(() => {
    const base = allLessons ?? lessons
    const map = new Map<string, Set<string>>()
    for (const lesson of base) {
      if (!lesson.teacher_id) continue
      if (lesson.lesson_kind !== 'temporary' || !lesson.specific_date) continue
      const key = `${lesson.specific_date}-${lesson.slot_index}`
      if (!map.has(key)) map.set(key, new Set())
      map.get(key)!.add(lesson.teacher_id)
    }
    return map
  }, [allLessons, lessons])

  // シフトを date → ShiftRecord[] にマップ
  const shiftByDate = useMemo(() => {
    const map = new Map<string, ShiftRecord[]>()
    for (const s of shifts) {
      if (!map.has(s.date)) map.set(s.date, [])
      map.get(s.date)!.push(s)
    }
    return map
  }, [shifts])

  const todayStr = toDateStr(new Date())

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
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Link href={`/schedule?date=${toDateStr(prevWeekDate)}`}
            className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            ‹ 前の週
          </Link>
          <Link href={`/schedule?date=${todayStr}`}
            className={[
              'px-3 py-1.5 text-sm rounded-lg border',
              weekDateStrings.includes(todayStr)
                ? 'text-gray-300 dark:text-gray-600 border-gray-100 dark:border-gray-700 pointer-events-none'
                : 'text-navy dark:text-blue-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium',
            ].join(' ')}>
            今日
          </Link>
        </div>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{monthStr} {weekRange}</span>
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={toDateStr(monday)}
            onChange={(e) => { if (e.target.value) router.push(`/schedule?date=${e.target.value}`) }}
            className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent"
            aria-label="表示する週の日付を選択"
          />
          <Link href={`/schedule?date=${toDateStr(nextWeekDate)}`}
            className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            次の週 ›
          </Link>
        </div>
      </div>

      {/* タブ＋表示オプション */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-1">
          {(['weekday', 'saturday'] as DayView[]).map(v => (
            <button key={v} onClick={() => setDayView(v)}
              className={['px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                dayView === v ? 'bg-navy text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200',
              ].join(' ')}>
              {v === 'weekday' ? '月〜金' : '土曜日'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* 表示密度トグル */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            {(['full', 'compact'] as const).map((d, i) => (
              <button key={d} onClick={() => setDensity(d)}
                className={['px-3 py-1.5 text-xs font-medium transition-colors',
                  i > 0 ? 'border-l border-gray-200 dark:border-gray-700' : '',
                  density === d ? 'bg-navy text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
                ].join(' ')}>
                {d === 'full' ? '詳細' : 'コンパクト'}
              </button>
            ))}
          </div>
          {/* 担当者フィルタ */}
          {teachers.length > 0 && (
            <select
              value={selectedTeacherId ?? ''}
              onChange={(e) => setSelectedTeacherId(e.target.value || null)}
              className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-navy"
            >
              <option value="">全員</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* 月〜金ビュー */}
      {dayView === 'weekday' && (
        <>
        {/* モバイル用の曜日切り替え（lg以上では全曜日を表として表示） */}
        <div className="lg:hidden flex gap-1 mb-3">
          {weekdays.map((day, i) => {
            const dateObj = new Date(weekDateStrings[i] + 'T12:00:00')
            const isToday = weekDateStrings[i] === todayStr
            return (
              <button
                key={day.value}
                onClick={() => setMobileDay(day.value)}
                className={[
                  'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
                  mobileDay === day.value
                    ? 'bg-navy text-white'
                    : isToday
                      ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
                ].join(' ')}
              >
                <div>{day.label}</div>
                <div className="text-[10px] opacity-70">{dateObj.getMonth() + 1}/{dateObj.getDate()}</div>
              </button>
            )
          })}
        </div>
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="w-36 border-b-2 border-b-gray-200 dark:border-b-gray-600 bg-gray-50 dark:bg-gray-900/50 px-3 py-3 text-left text-xs text-gray-500 dark:text-gray-400 font-medium sticky left-0 z-30">
                  時間帯
                </th>
                {weekdays.map((day, i) => {
                  const dateStr = weekDateStrings[i]
                  const isClosed = closureDates.includes(dateStr)
                  const isToday = dateStr === todayStr
                  const dateObj = new Date(dateStr)
                  const dateLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
                  return (
                    <th key={day.value}
                      className={['px-3 py-3 text-center font-semibold relative',
                        day.value === mobileDay ? '' : 'hidden lg:table-cell',
                        isClosed ? 'bg-red-50 dark:bg-red-950/40 text-red-400 border-b-2 border-b-gray-200 dark:border-b-gray-600' :
                        isToday ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-900 border-b-2 border-b-amber-200 dark:border-b-amber-900' :
                        'bg-gray-50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 border-b-2 border-b-gray-200 dark:border-b-gray-600',
                      ].join(' ')}>
                      {isToday && (
                        <span className="absolute top-0.5 right-1 text-[9px] font-bold text-amber-600 dark:text-amber-300">TODAY</span>
                      )}
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
                  <td className="border-b border-b-gray-100 dark:border-b-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 whitespace-nowrap sticky left-0 z-10">
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">第{slot.index}コマ</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">{slot.start}〜{slot.end}</div>
                  </td>
                  {weekdays.map((day, i) => {
                    const dateStr = weekDateStrings[i]
                    const isClosed = closureDates.includes(dateStr)
                    const isToday = dateStr === todayStr
                    const key = termType === 'intensive'
                      ? `${day.value}-${slot.index}`
                      : `${day.value}-i-${slot.index}`
                    const cellLessons = isClosed ? [] : (lessonMap.get(key) ?? [])

                    // 空き先生: その日シフトありかつこのスロット未担当
                    const busySet = busyTeacherMap.get(`${day.value}-${slot.index}`) ?? new Set<string>()
                    const tempBusySet = tempBusyByDate.get(`${dateStr}-${slot.index}`) ?? new Set<string>()
                    const dayShifts = isClosed ? [] : (shiftByDate.get(dateStr) ?? [])
                    const availableTeachers = teachers.filter(t =>
                      !busySet.has(t.id) &&
                      !tempBusySet.has(t.id) &&
                      dayShifts.some(s => s.teacher_id === t.id && shiftCoversSlot(s, slot.start, slot.end))
                    )

                    return (
                      <td key={day.value}
                        className={['px-2 py-2 align-top',
                          day.value === mobileDay ? '' : 'hidden lg:table-cell',
                          isClosed ? 'bg-red-50/50 border-b border-b-gray-100 dark:border-b-gray-700/50' :
                          isToday ? 'bg-amber-50/60 border-b border-b-amber-100 dark:border-b-amber-900/50' :
                          'border-b border-b-gray-100 dark:border-b-gray-700/50',
                        ].join(' ')}
                        style={{ minWidth: '190px' }}>
                        {isClosed ? (
                          <div className="h-10 flex items-center justify-center">
                            <span className="text-[11px] text-red-300">休校日</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <CellLessons lessons={cellLessons} dateStr={dateStr} makeups={makeupAssignments} absences={absences} teacherOverrides={teacherOverrides} density={density} selectedTeacherId={selectedTeacherId} />
                            {cellLessons.length === 0 && availableTeachers.length === 0 && (
                              <div className="h-10 flex items-center justify-center">
                                <span className="text-[10px] text-gray-300">—</span>
                              </div>
                            )}
                            {availableTeachers.length > 0 && (
                              <div className={['flex flex-wrap gap-1', cellLessons.length > 0 ? 'pt-1 mt-1 border-t border-gray-200 dark:border-gray-700' : ''].join(' ')}>
                                {availableTeachers.map(t => (
                                  <a
                                    key={t.id}
                                    href={`/schedule/new?teacher_id=${t.id}&date=${dateStr}&slot_index=${slot.index}&term_type=${termType}`}
                                    title="クリックして臨時コマを追加"
                                    className="text-[10px] bg-gray-50 dark:bg-gray-900/50 text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 px-1.5 py-0.5 rounded-full whitespace-nowrap hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-colors cursor-pointer"
                                  >
                                    {t.name}
                                  </a>
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
        </>
      )}

      {/* 土曜ビュー */}
      {dayView === 'saturday' && (
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          {isSatClosed && (
            <div className="mb-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-300 font-medium">
              今週の土曜日（{weekDateStrings[5]?.replace(/-/g, '/')}）は休校日です
            </div>
          )}
          {termType === 'intensive' ? (
            <table className="border-separate border-spacing-0 text-sm" style={{ minWidth: '400px' }}>
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="w-36 border-b-2 border-b-gray-200 dark:border-b-gray-600 bg-gray-50 dark:bg-gray-900/50 px-3 py-3 text-left text-xs text-gray-500 dark:text-gray-400 font-medium sticky left-0 z-30">時間帯</th>
                  <th className={['border-b-2 px-3 py-3 text-center text-sm font-semibold',
                    isSatClosed ? 'bg-red-50 dark:bg-red-950/40 text-red-400 border-b-gray-200 dark:border-b-gray-600' : 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200 border-b-purple-200 dark:border-b-purple-800'].join(' ')}
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
                      <td className="border-b border-b-gray-100 dark:border-b-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 whitespace-nowrap sticky left-0 z-10">
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">第{slot.index}コマ</div>
                        <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">{slot.start}〜{slot.end}</div>
                      </td>
                      <td className={['px-2 py-2 align-top border-b border-b-gray-100 dark:border-b-gray-700/50', isSatClosed ? 'bg-red-50/50' : ''].join(' ')}
                        style={{ minHeight: '80px' }}>
                        <div className="space-y-1">
                          <CellLessons lessons={cellLessons} dateStr={weekDateStrings[5]} makeups={makeupAssignments} absences={absences} teacherOverrides={teacherOverrides} density={density} selectedTeacherId={selectedTeacherId} />
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
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className="w-36 border-b-2 border-b-gray-200 dark:border-b-gray-600 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 text-left text-xs text-gray-500 dark:text-gray-400 font-medium sticky left-0 z-30">時間帯</th>
                    <th className="border-b-2 border-b-teal-200 dark:border-b-teal-800 bg-teal-50 dark:bg-teal-950/40 px-3 py-2.5 text-center text-sm font-semibold text-teal-800 dark:text-teal-200">個別指導</th>
                  </tr>
                </thead>
                <tbody>
                  {slots_sat_ind.map(slot => {
                    const key = `6-i-${slot.index}`
                    const cellLessons = isSatClosed ? [] : (lessonMap.get(key) ?? [])
                    return (
                      <tr key={slot.index}>
                        <td className="border-b border-b-gray-100 dark:border-b-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 whitespace-nowrap sticky left-0 z-10">
                          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">第{slot.index}コマ</div>
                          <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">{slot.start}〜{slot.end}</div>
                        </td>
                        <td className={['px-2 py-2 align-top border-b border-b-gray-100 dark:border-b-gray-700/50', isSatClosed ? 'bg-red-50/50' : ''].join(' ')}
                          style={{ minHeight: '72px' }}>
                          <div className="space-y-1">
                            <CellLessons lessons={cellLessons} density={density} selectedTeacherId={selectedTeacherId} />
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
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className="w-36 border-b-2 border-b-gray-200 dark:border-b-gray-600 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 text-left text-xs text-gray-500 dark:text-gray-400 font-medium sticky left-0 z-30">時間帯</th>
                    <th className="border-b-2 border-b-purple-200 dark:border-b-purple-800 bg-purple-50 dark:bg-purple-950/40 px-3 py-2.5 text-center text-sm font-semibold text-purple-800 dark:text-purple-200">集団授業</th>
                  </tr>
                </thead>
                <tbody>
                  {slots_group_sat.map(slot => {
                    const key = `6-g-${slot.index}`
                    const cellLessons = isSatClosed ? [] : (lessonMap.get(key) ?? [])
                    return (
                      <tr key={slot.index}>
                        <td className="border-b border-b-gray-100 dark:border-b-gray-700/50 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 whitespace-nowrap sticky left-0 z-10">
                          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">第{slot.index}コマ</div>
                          <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">{slot.start}〜{slot.end}</div>
                        </td>
                        <td className={['px-2 py-2 align-top border-b border-b-gray-100 dark:border-b-gray-700/50', isSatClosed ? 'bg-red-50/50' : ''].join(' ')}
                          style={{ minHeight: '72px' }}>
                          <div className="space-y-1">
                            <CellLessons lessons={cellLessons} density={density} selectedTeacherId={selectedTeacherId} />
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

type MergedLesson = Lesson & { _mergedIds?: string[] }

// 同じ枠内で「同じ先生・同じ授業形式」のコマは1枚のカードにまとめる。
// （物理的に1人の先生が同一コマで複数枠を持つことはないため、複数レコードは統合表示する）
function mergeLessonsByTeacher(lessons: Lesson[]): MergedLesson[] {
  const groups = new Map<string, Lesson[]>()
  const order: string[] = []
  for (const l of lessons) {
    // 先生未割り当てはまとめず個別に扱う
    const key = l.teacher_id ? `${l.teacher_id}-${l.type}` : `none-${l.id}`
    if (!groups.has(key)) { groups.set(key, []); order.push(key) }
    groups.get(key)!.push(l)
  }
  return order.map((key) => {
    const group = groups.get(key)!
    if (group.length === 1) return group[0]
    const base = group[0]
    return {
      ...base,
      capacity: group.reduce((s, l) => s + l.capacity, 0),
      enrollments: group.flatMap((l) => l.enrollments ?? []),
      subject: [...new Set(group.map((l) => l.subject).filter(Boolean))].join('・') || base.subject,
      _mergedIds: group.map((l) => l.id),
    } as MergedLesson
  })
}

function CellLessons({ lessons, dateStr, makeups = [], absences = [], teacherOverrides = [], density = 'full', selectedTeacherId = null }: {
  lessons: Lesson[]
  dateStr?: string
  makeups?: MakeupAssignment[]
  absences?: AbsenceRecord[]
  teacherOverrides?: TeacherOverride[]
  density?: 'full' | 'compact'
  selectedTeacherId?: string | null
}) {
  const merged = useMemo(() => mergeLessonsByTeacher(lessons), [lessons])
  const compact = density === 'compact' || merged.length >= 3
  return (
    <>
      {merged.map(lesson => {
        const ids = lesson._mergedIds ?? [lesson.id]
        const ov = teacherOverrides.find((o) => ids.includes(o.lesson_id) && o.date === dateStr)
        return (
          <div key={lesson.id} className={selectedTeacherId && lesson.teacher_id !== selectedTeacherId ? 'opacity-30' : ''}>
            <LessonCard
              lesson={lesson}
              compact={compact}
              makeupStudents={makeups
                .filter((m) => ids.includes(m.lesson_id) && m.assigned_date === dateStr && m.student)
                .map((m) => ({ ...m.student!, kind: m.kind ?? 'makeup', subject: m.subject }))}
              absentStudentIds={absences
                .filter((a) => ids.includes(a.lesson_id) && a.date === dateStr)
                .map((a) => a.student_id)}
              overrideTeacherName={ov ? (ov.teacher_name ?? '') : undefined}
            />
          </div>
        )
      })}
    </>
  )
}
