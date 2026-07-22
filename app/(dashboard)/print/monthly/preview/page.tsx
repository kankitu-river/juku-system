import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { expandLessonsForMonth } from '@/lib/utils/schedule'
import { getSlotLabel } from '@/lib/constants/timeSlots'
import type { Lesson, TermPeriod } from '@/types'
import { PrintButton } from '@/components/print/PrintButton'
import { AutoPrint } from '@/components/print/AutoPrint'
import { getDisplayGrade } from '@/lib/utils/grade'

interface PageProps {
  searchParams: Promise<{
    year?: string
    month?: string
    type?: string
    id?: string
    showTeacher?: string
  }>
}

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']
const CIRCLE_NUMS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫']

function shortSubject(s: string | null | undefined): string {
  if (!s) return ''
  const map: Record<string, string> = {
    '国語': '国', '算数': '算', '数学': '数', '英語': '英',
    '理科': '理', '社会': '社', '物理': '物', '化学': '化',
    '生物': '生', '地理': '地', '歴史': '歴', '国算': '国算',
  }
  return map[s] ?? s.slice(0, 2)
}

const toCircle = (n: number) => CIRCLE_NUMS[n - 1] ?? String(n)
const surname = (name: string) => name.slice(0, 3)

export default async function MonthlyPreviewPage({ searchParams }: PageProps) {
  const { year: yearStr, month: monthStr, type, id, showTeacher: showTeacherStr } = await searchParams
  const showTeacher = showTeacherStr !== 'false'
  const year = Number(yearStr ?? new Date().getFullYear())
  const month = Number(monthStr ?? new Date().getMonth() + 1)
  const monthLabel = `${year}年${month}月`

  if (!type || !id || !['teacher', 'student'].includes(type)) {
    return <div className="p-8 text-red-500">パラメータが不正です</div>
  }

  const supabase = await createClient()

  const monthPad = (n: number) => String(n).padStart(2, '0')
  const monthStart = `${year}-${monthPad(month)}-01`
  const monthEnd = `${year}-${monthPad(month)}-${monthPad(new Date(year, month, 0).getDate())}`

  const [{ data: termPeriods }, { data: lessons }, { data: makeupData }] = await Promise.all([
    supabase.from('term_periods').select('*').order('start_date'),
    supabase
      .from('lessons')
      .select('*, teacher:teachers(id, name), enrollments:lesson_enrollments(student_id, subject, student:students(id, name))')
      .order('day_of_week')
      .order('slot_index'),
    supabase
      .from('makeup_assignments')
      .select('lesson_id, assigned_date, student_id, student:students(id, name), lesson:lessons(id, slot_index, day_of_week, term_type, type, subject, teacher_id, teacher:teachers(id, name))')
      .gte('assigned_date', monthStart)
      .lte('assigned_date', monthEnd),
  ])

  type MakeupRow = {
    lesson_id: string
    assigned_date: string
    student_id: string
    student: { id: string; name: string } | null
    lesson: {
      id: string; slot_index: number; day_of_week: number
      term_type: 'regular' | 'intensive'; type: 'group' | 'individual'
      subject: string | null; teacher_id: string | null
      teacher: { id: string; name: string } | null
    } | null
  }
  const makeups = (makeupData ?? []) as unknown as MakeupRow[]

  const typedTermPeriods = (termPeriods as TermPeriod[]) ?? []
  const typedLessons = (lessons as Lesson[]) ?? []

  let personName = ''
  let personSub = ''
  let filteredLessons: Lesson[] = []

  if (type === 'teacher') {
    const { data: teacher } = await supabase
      .from('teachers').select('id, name, subjects').eq('id', id).single()
    if (!teacher) return <div className="p-8 text-red-500">先生が見つかりません</div>
    personName = teacher.name
    personSub = (teacher.subjects as string[] | null)?.join('・') ?? ''
    filteredLessons = typedLessons.filter((l) => l.teacher_id === teacher.id)
  } else {
    const { data: student } = await supabase
      .from('students').select('id, name, grade').eq('id', id).single()
    if (!student) return <div className="p-8 text-red-500">生徒が見つかりません</div>
    personName = student.name
    personSub = student.grade ? getDisplayGrade(student.grade) : ''
    filteredLessons = typedLessons.filter((l) =>
      (l.enrollments ?? []).some((e) => e.student_id === student.id)
    )
  }

  const entries = expandLessonsForMonth(filteredLessons, year, month, typedTermPeriods)

  const byDate = new Map<string, typeof entries>()
  for (const entry of entries) {
    if (!byDate.has(entry.dateStr)) byDate.set(entry.dateStr, [])
    byDate.get(entry.dateStr)!.push(entry)
  }

  const makeupByLessonDate = new Map<string, { id: string; name: string }[]>()
  if (type === 'teacher') {
    for (const m of makeups) {
      if (!m.student || m.lesson?.teacher_id !== id) continue
      const k = `${m.lesson_id}__${m.assigned_date}`
      if (!makeupByLessonDate.has(k)) makeupByLessonDate.set(k, [])
      makeupByLessonDate.get(k)!.push(m.student)
    }
  }

  const studentMakeupsByDate = new Map<string, { slotIndex: number; timeLabel: string; teacherName: string | null; subject: string | null }[]>()
  let studentMakeupCount = 0
  if (type === 'student') {
    for (const m of makeups) {
      if (m.student_id !== id || !m.lesson) continue
      const timeLabel = getSlotLabel(m.lesson.slot_index, m.lesson.day_of_week, m.lesson.term_type, m.lesson.type)
      if (!studentMakeupsByDate.has(m.assigned_date)) studentMakeupsByDate.set(m.assigned_date, [])
      studentMakeupsByDate.get(m.assigned_date)!.push({
        slotIndex: m.lesson.slot_index,
        timeLabel,
        teacherName: m.lesson.teacher?.name ?? null,
        subject: m.lesson.subject,
      })
      studentMakeupCount++
    }
  }

  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startDow = firstDay.getDay()

  const totalCells = Math.ceil((daysInMonth + startDow) / 7) * 7
  const cells: (number | null)[] = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDow + 1
    cells.push(dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null)
  }
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  const maxPerCell = weeks.length >= 6 ? 3 : 4

  const printDate = new Date().toLocaleDateString('ja-JP')
  const pad = (n: number) => String(n).padStart(2, '0')
  const dayNumToDateStr = (day: number) => `${year}-${pad(month)}-${pad(day)}`

  return (
    <div className="print-root bg-white min-h-screen">
      <AutoPrint />
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          #monthly-print-area {
            width: 100%;
            height: 194mm;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            overflow: hidden;
            padding: 0;
          }
          .mpp-header {
            flex-shrink: 0;
            margin-bottom: 3mm;
            padding-bottom: 3mm;
          }
          .mpp-calendar {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
            overflow: hidden;
          }
          .mpp-weekday-row {
            flex-shrink: 0;
            display: flex;
          }
          .mpp-week-row {
            flex: 1;
            display: flex;
            min-height: 0;
            overflow: hidden;
          }
          .mpp-day-cell {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            box-sizing: border-box;
          }
          .mpp-day-cell > div {
            min-height: 0 !important;
          }
          .mpp-entry-list {
            gap: 1px !important;
          }
          .mpp-footer {
            flex-shrink: 0;
            margin-top: 2mm;
          }
        }
      `}</style>

      {/* Controls */}
      <div className="no-print bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/print/monthly" className="text-sm text-gray-500 hover:text-gray-700">← 月次印刷に戻る</Link>
          <span className="text-sm font-medium text-gray-700">{monthLabel} · {personName}</span>
        </div>
        <div className="flex items-center gap-3">
          {type === 'student' && (
            <Link
              href={`?year=${year}&month=${month}&type=${type}&id=${id}&showTeacher=${!showTeacher}`}
              className={[
                'text-sm px-3 py-1.5 rounded-lg border transition-colors',
                showTeacher
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
              ].join(' ')}
            >
              先生名を{showTeacher ? '表示中' : '非表示'}
            </Link>
          )}
          <PrintButton label="印刷（PDF保存）" />
        </div>
      </div>

      {/* Print content */}
      <div id="monthly-print-area" className="p-6">
        {/* Header */}
        <div className="mpp-header flex items-end justify-between pb-3 border-b-2 border-navy mb-4 print:mb-0">
          <div>
            <p className="text-xs text-gray-500">月次スケジュール</p>
            <h1 className="text-2xl font-bold text-navy">{personName}</h1>
            {personSub && <p className="text-sm text-gray-500">{personSub}</p>}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-gray-800">{monthLabel}</p>
            <p className="text-xs text-gray-400 mt-0.5 hidden print:block">印刷日: {printDate}</p>
          </div>
        </div>

        {/* Calendar */}
        <div className="mpp-calendar w-full text-xs">
          {/* Weekday header */}
          <div className="mpp-weekday-row flex">
            {DOW_LABELS.map((d, i) => (
              <div key={d} className={[
                'mpp-day-cell border border-gray-300 py-1.5 text-center text-xs font-bold',
                i === 0 ? 'text-red-600 bg-red-50' : i === 6 ? 'text-blue-600 bg-blue-50' : 'text-gray-700 bg-gray-100',
              ].join(' ')} style={{ width: '14.28%' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Week rows */}
          {weeks.map((week, wi) => (
            <div key={wi} className="mpp-week-row flex">
              {week.map((day, di) => {
                const isSun = di === 0
                const isSat = di === 6
                const dateStr = day ? dayNumToDateStr(day) : null
                const dayEntries = dateStr ? (byDate.get(dateStr) ?? []) : []
                const makeupEntries = (type === 'student' && dateStr)
                  ? (studentMakeupsByDate.get(dateStr) ?? [])
                  : []
                const hasLesson = dayEntries.length > 0 || makeupEntries.length > 0

                const visibleDayEntries = dayEntries.slice(0, maxPerCell)
                const remainingSlots = maxPerCell - visibleDayEntries.length
                const visibleMakeupEntries = makeupEntries.slice(0, remainingSlots)
                const hiddenCount =
                  (dayEntries.length - visibleDayEntries.length) +
                  (makeupEntries.length - visibleMakeupEntries.length)

                return (
                  <div key={di} className={[
                    'mpp-day-cell border border-gray-300 p-0 overflow-hidden',
                    !day ? 'bg-gray-50' : '',
                    isSun && day ? 'bg-red-50/30' : '',
                    isSat && day ? 'bg-blue-50/30' : '',
                  ].join(' ')} style={{ width: '14.28%', minHeight: '8rem' }}>
                    <div className="overflow-hidden p-1 flex flex-col h-full">
                      {day && (
                        <>
                          {/* 日付 */}
                          <div className={[
                            'font-bold text-sm leading-none mb-1 flex-shrink-0',
                            isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700',
                            hasLesson ? 'text-navy' : '',
                          ].join(' ')}>
                            {day}
                          </div>

                          {/* コマ一覧 */}
                          <div className="mpp-entry-list space-y-0.5 overflow-hidden flex-1 min-h-0 flex flex-col">
                            {visibleDayEntries.map(({ lesson, timeLabel }, ei) => {
                              if (type === 'teacher') {
                                const enrolledStudents = (lesson.enrollments ?? [])
                                  .filter(e => e.student != null)
                                  .map(e => ({
                                    name: (e as { student?: { name: string } }).student?.name ?? '',
                                    subject: (e as { subject?: string | null }).subject ?? lesson.subject ?? '',
                                  }))
                                const makeupStudents = makeupByLessonDate.get(`${lesson.id}__${dateStr}`) ?? []
                                const tStart = (timeLabel || '').split(/[〜~\-]/)[0].trim()
                                // 印刷用1行テキスト: ①16:30 涌井(国)/金子(算)
                                const printLine = [
                                  `${toCircle(lesson.slot_index)}${tStart}`,
                                  enrolledStudents.length > 0
                                    ? enrolledStudents.map(s => `${surname(s.name)}(${shortSubject(s.subject)})`).join('/')
                                    : (shortSubject(lesson.subject) || '—'),
                                  makeupStudents.length > 0
                                    ? '+' + makeupStudents.map(mk => `${surname(mk.name)}振`).join('/')
                                    : '',
                                ].filter(Boolean).join(' ')
                                return (
                                  <div key={ei} className="overflow-hidden">
                                    {/* screen */}
                                    <div className="print:hidden bg-teal-50 border border-teal-200 rounded px-1 py-0.5">
                                      <p className="text-[9px] text-teal-600 font-bold leading-tight">第{lesson.slot_index}コマ</p>
                                      <p className="text-[8px] text-teal-500 leading-none mb-0.5">{timeLabel}</p>
                                      {enrolledStudents.length > 0 ? (
                                        enrolledStudents.map((s, si) => (
                                          <p key={si} className="text-[9px] text-gray-800 leading-tight truncate">
                                            {s.name}{s.subject ? `（${shortSubject(s.subject)}）` : ''}
                                          </p>
                                        ))
                                      ) : (
                                        <p className="text-[9px] text-gray-400 leading-tight">{lesson.subject || '—'}</p>
                                      )}
                                      {makeupStudents.map((mk, mi) => (
                                        <p key={`mk-${mi}`} className="text-[9px] font-bold text-amber-800 bg-amber-100 rounded px-0.5 leading-tight truncate">
                                          {mk.name}（振替）
                                        </p>
                                      ))}
                                    </div>
                                    {/* print: 1行圧縮 */}
                                    <p className="hidden print:block truncate text-[8px] leading-tight text-gray-800 font-medium">
                                      {printLine}
                                    </p>
                                  </div>
                                )
                              } else {
                                const enrollment = (lesson.enrollments ?? []).find(e => e.student_id === id)
                                const mySubject = (enrollment as { subject?: string | null } | undefined)?.subject ?? lesson.subject
                                const teacherName = (lesson as { teacher?: { name: string } }).teacher?.name
                                const isGroup = lesson.type === 'group'
                                const startTime = (timeLabel || '').split(/[〜~\-]/)[0].trim()
                                // 印刷用1行テキスト: ①16:30 国·金子T
                                const printParts = [
                                  `${toCircle(lesson.slot_index)}${startTime}`,
                                  shortSubject(mySubject),
                                  teacherName && showTeacher ? `·${surname(teacherName)}T` : '',
                                ]
                                const printLine = printParts.filter(Boolean).join(' ')
                                return (
                                  <div key={ei} className="overflow-hidden">
                                    {/* screen */}
                                    <div className={[
                                      'print:hidden border rounded px-1 py-0.5',
                                      isGroup ? 'bg-purple-50 border-purple-200' : 'bg-teal-50 border-teal-200',
                                    ].join(' ')}>
                                      <p className={[
                                        'text-[9px] font-bold leading-tight',
                                        isGroup ? 'text-purple-600' : 'text-teal-600',
                                      ].join(' ')}>第{lesson.slot_index}コマ</p>
                                      <p className={[
                                        'text-[8px] leading-none mb-0.5',
                                        isGroup ? 'text-purple-400' : 'text-teal-400',
                                      ].join(' ')}>{timeLabel}</p>
                                      {teacherName && showTeacher && (
                                        <p className="text-[9px] text-gray-800 leading-tight truncate">{teacherName}先生</p>
                                      )}
                                      {mySubject && (
                                        <p className="text-[9px] text-gray-500 leading-tight">{mySubject}</p>
                                      )}
                                    </div>
                                    {/* print: 1行圧縮 */}
                                    <p className="hidden print:block truncate text-[8px] leading-tight text-gray-800 font-medium">
                                      {printLine}
                                    </p>
                                  </div>
                                )
                              }
                            })}

                            {/* 生徒ビュー: 振替コマ */}
                            {visibleMakeupEntries.map((mk, mi) => {
                              const mkStart = (mk.timeLabel || '').split(/[〜~\-]/)[0].trim()
                              const printLine = [
                                `${toCircle(mk.slotIndex)}振${mkStart}`,
                                shortSubject(mk.subject),
                                mk.teacherName && showTeacher ? `·${surname(mk.teacherName)}T` : '',
                              ].filter(Boolean).join(' ')
                              return (
                                <div key={`mk-${mi}`} className="overflow-hidden">
                                  {/* screen */}
                                  <div className="print:hidden bg-amber-50 border border-amber-300 rounded px-1 py-0.5">
                                    <p className="text-[9px] text-amber-700 font-bold leading-tight">
                                      第{mk.slotIndex}コマ
                                      <span className="ml-1 text-[8px] bg-amber-200 text-amber-800 px-0.5 rounded font-bold">振替</span>
                                    </p>
                                    <p className="text-[8px] text-amber-500 leading-none mb-0.5">{mk.timeLabel}</p>
                                    {mk.teacherName && showTeacher && (
                                      <p className="text-[9px] text-gray-800 leading-tight truncate">{mk.teacherName}先生</p>
                                    )}
                                    {mk.subject && (
                                      <p className="text-[9px] text-gray-500 leading-tight">{mk.subject}</p>
                                    )}
                                  </div>
                                  {/* print: 1行圧縮 */}
                                  <p className="hidden print:block truncate text-[8px] leading-tight text-amber-700 font-medium">
                                    {printLine}
                                  </p>
                                </div>
                              )
                            })}

                            {/* オーバーフロー */}
                            {hiddenCount > 0 && (
                              <p className="text-[6px] text-gray-400 text-center leading-tight mt-auto">他{hiddenCount}件</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mpp-footer mt-3 flex justify-between items-center text-xs text-gray-400">
          <span>全{entries.length + studentMakeupCount}コマ{studentMakeupCount > 0 ? `（うち振替${studentMakeupCount}）` : ''}</span>
          <span className="hidden print:inline">塾スケジュール管理システム</span>
        </div>
      </div>
    </div>
  )
}
