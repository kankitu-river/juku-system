import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { REGULAR_SLOTS, INTENSIVE_SLOTS, GROUP_SATURDAY_SLOTS, SATURDAY_INDIVIDUAL_SLOTS } from '@/lib/constants/timeSlots'
import type { Lesson, TermPeriod } from '@/types'
import { WeekPrintClient } from './WeekPrintClient'

interface PageProps {
  searchParams: Promise<{ date?: string; waiting?: string }>
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  const start = new Date(d)
  start.setDate(d.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 5) // Mon-Sat
  return { start, end }
}

const DAY_NAMES = ['', '月', '火', '水', '木', '金', '土']

export default async function WeekPrintPage({ searchParams }: PageProps) {
  const { date, waiting } = await searchParams
  const showWaiting = waiting !== '0'
  const refDate = date ? new Date(date) : new Date()
  const { start, end } = getWeekRange(refDate)

  const supabase = await createClient()
  const pad = (n: number) => String(n).padStart(2, '0')
  const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const weekDateStrs = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i); return toLocalDate(d)
  })

  const [{ data: lessons }, { data: termPeriods }, { data: teachersData }, { data: shiftsData }, { data: makeupData }] = await Promise.all([
    supabase
      .from('lessons')
      .select('*, teacher:teachers(id, name), booth:booths(id, name), enrollments:lesson_enrollments(id, subject, student:students(id, name))')
      .order('day_of_week')
      .order('slot_index'),
    supabase.from('term_periods').select('*').order('start_date'),
    supabase.from('teachers').select('id, name').order('name'),
    supabase.from('shifts').select('teacher_id, date, start_time, end_time').in('date', weekDateStrs),
    supabase.from('makeup_assignments').select('lesson_id, assigned_date, student:students(id, name)').in('assigned_date', weekDateStrs),
  ])

  // `${lesson_id}__${date}` -> 振替生徒リスト
  const makeupByLessonDate = new Map<string, { id: string; name: string }[]>()
  for (const m of (makeupData ?? []) as unknown as { lesson_id: string; assigned_date: string; student: { id: string; name: string } | null }[]) {
    if (!m.student) continue
    const k = `${m.lesson_id}__${m.assigned_date}`
    if (!makeupByLessonDate.has(k)) makeupByLessonDate.set(k, [])
    makeupByLessonDate.get(k)!.push(m.student)
  }
  // 週（月〜土）のいずれかが講習期間に重なれば intensive とみなす（移行週で月曜だけ判定するとズレるため）
  const termsArr = (termPeriods as TermPeriod[]) ?? []
  const findTerm = (ds: string) => termsArr.find((t) => t.start_date <= ds && t.end_date >= ds)
  const activeTerm =
    weekDateStrs.map(findTerm).find((t) => t?.type === 'intensive') ??
    findTerm(toLocalDate(start))
  const currentTermType = activeTerm?.type ?? 'regular'

  const typedLessons = (lessons as Lesson[]) ?? []
  const allTeachers = (teachersData ?? []) as { id: string; name: string }[]

  // 曜日×スロットで担当中の先生IDセット
  const busyTeacherMap = new Map<string, Set<string>>()
  for (const lesson of typedLessons) {
    if (!lesson.teacher_id) continue
    const k = `${lesson.day_of_week}-${lesson.slot_index}`
    const s = busyTeacherMap.get(k) ?? new Set<string>()
    s.add(lesson.teacher_id)
    busyTeacherMap.set(k, s)
  }

  // 日付→シフト一覧
  const shiftByDate = new Map<string, { teacher_id: string; start_time: string; end_time: string }[]>()
  for (const shift of (shiftsData ?? []) as { teacher_id: string; date: string; start_time: string; end_time: string }[]) {
    const list = shiftByDate.get(shift.date) ?? []
    list.push(shift)
    shiftByDate.set(shift.date, list)
  }

  function shiftCoversSlot(shift: { start_time: string; end_time: string }, slotStart: string, slotEnd: string) {
    return shift.start_time <= slotStart && shift.end_time >= slotEnd
  }

  // Group lessons by day and slot key
  // Map: dayOfWeek -> slot_index -> lesson[]
  type LessonMap = Map<string, Lesson[]>
  const lessonMap: LessonMap = new Map()

  for (const lesson of typedLessons) {
    if (lesson.lesson_kind === 'temporary') {
      // 臨時コマは今週の日付のものだけ
      if (!lesson.specific_date || !weekDateStrs.includes(lesson.specific_date)) continue
    } else if (lesson.term_type !== currentTermType) {
      // 通常コマは期間区分が一致するもののみ
      continue
    }
    const key = `${lesson.day_of_week}-${lesson.slot_index}-${lesson.type}`
    const existing = lessonMap.get(key) ?? []
    lessonMap.set(key, [...existing, lesson])
  }

  // Build slot rows for weekdays (Mon-Fri = 1-5)
  const slots = currentTermType === 'intensive' ? INTENSIVE_SLOTS : REGULAR_SLOTS

  // Build dates array for Mon-Sat
  const weekDates: Date[] = []
  for (let i = 0; i <= 5; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    weekDates.push(d)
  }

  const prevWeek = new Date(start)
  prevWeek.setDate(start.getDate() - 7)
  const nextWeek = new Date(start)
  nextWeek.setDate(start.getDate() + 7)

  const startLabel = start.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
  const endLabel = end.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
  const yearLabel = start.getFullYear()

  // 教室掲示用にA3横で印刷。大きい紙なので読める文字サイズを確保する
  const isIntensive = currentTermType === 'intensive'
  const tableFont = isIntensive ? 10 : 12
  const pillFont = isIntensive ? 9 : 11
  const cellMinH = isIntensive ? 34 : 60

  return (
    <div className="print-root bg-white min-h-screen">
      <style>{`
        @media print {
          @page { size: A3 landscape; margin: 6mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .wpl-printbody { zoom: 1.0; }
          .wpl-wrap { display: flex; align-items: flex-start; gap: 5mm; }
          .wpl-days { flex: 13; min-width: 0; }
          .wpl-sat  { flex: 4;  min-width: 0; }
          .wpl-table { font-size: ${tableFont}px !important; table-layout: fixed; width: 100%; }
          .wpl-table th, .wpl-table td { padding: 2px 3px !important; }
          .wpl-cell { padding: 2px 4px !important; margin-bottom: 2px !important; height: auto !important; min-height: ${cellMinH}px !important; overflow: visible !important; }
          .wpl-cell p { margin: 0 !important; line-height: 1.3 !important; }
          .wpl-pill { font-size: ${pillFont}px !important; padding: 0 4px !important; margin-bottom: 1px !important; }
          .wpl-h2 { font-size: 12px !important; margin-bottom: 3px !important; }
          .wpl-h3 { font-size: 11px !important; margin-bottom: 2px !important; }
        }
      `}</style>
      {/* Controls (hidden on print) */}
      <div className="no-print bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/schedule" className="text-sm text-gray-500 hover:text-gray-700">← 戻る</Link>
          <Link
            href={`/schedule/print/week?date=${toLocalDate(prevWeek)}`}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            ‹ 前週
          </Link>
          <span className="text-sm font-medium text-gray-700">
            {yearLabel}年 {startLabel} 〜 {endLabel}
          </span>
          <Link
            href={`/schedule/print/week?date=${toLocalDate(nextWeek)}`}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            次週 ›
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className={[
            'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
            currentTermType === 'intensive'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-blue-100 text-blue-800',
          ].join(' ')}>
            {activeTerm ? activeTerm.name : '通常期間'}
          </span>
          <WeekPrintClient showWaiting={showWaiting} weekDateStr={toLocalDate(start)} />
        </div>
      </div>

      {/* Print content */}
      <div className="p-6 print:p-0 wpl-printbody">
        {/* Header */}
        <div className="mb-4 print:mb-3">
          <h1 className="text-xl font-bold text-navy">週間スケジュール</h1>
          <p className="text-sm text-gray-500">
            {yearLabel}年 {startLabel} 〜 {endLabel}
            {activeTerm && <span className="ml-2 text-amber-600">（{activeTerm.name}）</span>}
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs no-print">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-purple-100 border border-purple-300" />
            集団授業
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-teal-100 border border-teal-300" />
            個別指導
          </span>
        </div>

        {/* Weekday + Saturday: side-by-side on print */}
        <div className="wpl-wrap">
        <section className="mb-6 print:mb-0 wpl-days">
          <h2 className="text-sm font-semibold text-gray-600 mb-2 wpl-h2">月〜金（個別指導）</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs wpl-table">
              <thead>
                <tr>
                  <th className="border border-gray-300 bg-navy text-white px-2 py-1.5 text-left w-28">時間帯</th>
                  {weekDates.slice(0, 5).map((d, i) => {
                    const dow = i + 1
                    const day = d.getDate()
                    const month = d.getMonth() + 1
                    return (
                      <th key={dow} className="border border-gray-300 bg-navy text-white px-2 py-1.5 text-center">
                        {DAY_NAMES[dow]}（{month}/{day}）
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot.index}>
                    <td className="border border-gray-300 bg-gray-50 px-2 py-2 text-center font-medium whitespace-nowrap">
                      <div className="font-bold">第{slot.index}コマ</div>
                      <div className="text-gray-500">{slot.start}〜{slot.end}</div>
                    </td>
                    {[1, 2, 3, 4, 5].map((dow) => {
                      const key = `${dow}-${slot.index}-individual`
                      const cellLessons = lessonMap.get(key) ?? []
                      const dateStr2 = weekDateStrs[dow - 1]
                      const busySet = busyTeacherMap.get(`${dow}-${slot.index}`) ?? new Set()
                      const dayShifts = shiftByDate.get(dateStr2) ?? []
                      const waitingTeachers = allTeachers.filter(t =>
                        !busySet.has(t.id) &&
                        dayShifts.some(s => s.teacher_id === t.id && shiftCoversSlot(s, slot.start, slot.end))
                      )
                      return (
                        <td key={dow} className="border border-gray-300 px-1 py-1 align-top">
                          {cellLessons.map((lesson) => (
                            <LessonCell key={lesson.id} lesson={lesson} makeupStudents={makeupByLessonDate.get(`${lesson.id}__${dateStr2}`) ?? []} />
                          ))}
                          {showWaiting && waitingTeachers.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {waitingTeachers.map(t => (
                                <span key={t.id} className="text-[8px] bg-blue-50 text-blue-600 border border-dashed border-blue-300 px-1 py-0.5 rounded-full whitespace-nowrap wpl-pill">
                                  {t.name}
                                </span>
                              ))}
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
        </section>

        {/* Saturday table */}
        <section className="wpl-sat">
          <h2 className="text-sm font-semibold text-gray-600 mb-2 wpl-h2">
            土曜日（{weekDates[5].getMonth() + 1}/{weekDates[5].getDate()}）
          </h2>
          <div className="space-y-3 print:space-y-1">
            {/* Saturday individual */}
            <div>
              <h3 className="text-xs font-medium text-teal-700 mb-1 wpl-h3">個別指導</h3>
              <table className="w-full border-collapse text-xs wpl-table">
                <thead>
                  <tr>
                    <th className="border border-gray-300 bg-teal-700 text-white px-2 py-1 text-left">時間帯</th>
                    <th className="border border-gray-300 bg-teal-700 text-white px-2 py-1 text-center">コマ</th>
                  </tr>
                </thead>
                <tbody>
                  {SATURDAY_INDIVIDUAL_SLOTS.map((slot) => {
                    const key = `6-${slot.index}-individual`
                    const cellLessons = lessonMap.get(key) ?? []
                    return (
                      <tr key={slot.index}>
                        <td className="border border-gray-300 bg-gray-50 px-2 py-1 text-center whitespace-nowrap">
                          <div className="font-bold">第{slot.index}コマ</div>
                          <div className="text-gray-500 text-[10px]">{slot.start}〜{slot.end}</div>
                        </td>
                        <td className="border border-gray-300 px-1 py-1 align-top">
                          {cellLessons.map((lesson) => (
                            <LessonCell key={lesson.id} lesson={lesson} makeupStudents={makeupByLessonDate.get(`${lesson.id}__${weekDateStrs[5]}`) ?? []} />
                          ))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Saturday group */}
            <div>
              <h3 className="text-xs font-medium text-purple-700 mb-1 wpl-h3">集団授業</h3>
              <table className="w-full border-collapse text-xs wpl-table">
                <thead>
                  <tr>
                    <th className="border border-gray-300 bg-purple-700 text-white px-2 py-1 text-left">時間帯</th>
                    <th className="border border-gray-300 bg-purple-700 text-white px-2 py-1 text-center">コマ</th>
                  </tr>
                </thead>
                <tbody>
                  {GROUP_SATURDAY_SLOTS.map((slot) => {
                    const key = `6-${slot.index}-group`
                    const cellLessons = lessonMap.get(key) ?? []
                    return (
                      <tr key={slot.index}>
                        <td className="border border-gray-300 bg-gray-50 px-2 py-1 text-center whitespace-nowrap">
                          <div className="font-bold">第{slot.index}コマ</div>
                          <div className="text-gray-500 text-[10px]">{slot.start}〜{slot.end}</div>
                        </td>
                        <td className="border border-gray-300 px-1 py-1 align-top">
                          {cellLessons.map((lesson) => (
                            <LessonCell key={lesson.id} lesson={lesson} makeupStudents={makeupByLessonDate.get(`${lesson.id}__${weekDateStrs[5]}`) ?? []} />
                          ))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        </div>{/* /wpl-wrap */}

        {/* Print footer */}
        <div className="hidden print:block mt-4 pt-3 border-t border-gray-300 text-[10px] text-gray-400 flex justify-between">
          <span>塾スケジュール管理システム</span>
          <span>印刷日: {new Date().toLocaleDateString('ja-JP')}</span>
        </div>
      </div>
    </div>
  )
}

function LessonCell({ lesson, makeupStudents = [] }: { lesson: Lesson; makeupStudents?: { id: string; name: string }[] }) {
  const isGroup = lesson.type === 'group'
  const teacher = (lesson as { teacher?: { name: string } }).teacher
  const enrollments = lesson.enrollments ?? []
  const students = enrollments
    .map((e) => ({ student: e.student, subject: (e as { subject?: string | null }).subject ?? null }))
    .filter((e): e is { student: NonNullable<typeof e.student>; subject: string | null } => e.student != null)

  return (
    <div className={[
      'rounded-md px-2 py-1.5 mb-1 leading-snug border-l-4 wpl-cell',
      isGroup
        ? 'bg-purple-50 border-l-purple-500 border border-purple-200'
        : 'bg-teal-50 border-l-teal-500 border border-teal-200',
    ].join(' ')}>
      {/* 先生名 + バッジ + 定員 */}
      <div className="flex items-center gap-1 mb-0.5">
        {lesson.is_ps1 && (
          <span className="text-[7px] font-bold px-1 rounded bg-purple-500 text-white wpl-pill">1対1</span>
        )}
        {teacher?.name && (
          <span className={[
            'text-[10px] font-bold px-1.5 py-0.5 rounded-full wpl-pill',
            isGroup ? 'bg-purple-700 text-white' : 'bg-teal-700 text-white',
          ].join(' ')}>
            {teacher.name}
          </span>
        )}
        <span className={[
          'ml-auto text-[8px] font-bold px-1 rounded-full flex-shrink-0',
          isGroup ? 'bg-purple-200 text-purple-800' : 'bg-teal-200 text-teal-800',
        ].join(' ')}>
          {students.length + makeupStudents.length}/{lesson.capacity}名
        </span>
      </div>
      {/* 生徒一覧（全員表示、名前を切り捨てない） */}
      {students.length > 0 || makeupStudents.length > 0 ? (
        <div className="text-[10px] text-gray-800">
          {students.map(({ student: s, subject }, i) => (
            <p key={i} className="whitespace-nowrap">
              {s.name}{subject ? `（${subject}）` : ''}
            </p>
          ))}
          {makeupStudents.map((m) => (
            <p key={m.id} className="whitespace-nowrap font-bold text-amber-800 bg-amber-100 rounded px-0.5">
              {m.name}<span className="text-[8px] ml-0.5">振替</span>
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400">生徒未登録</p>
      )}
    </div>
  )
}
