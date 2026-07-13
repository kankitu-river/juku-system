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

// 科目を短縮表示
function shortSubject(s: string | null | undefined): string {
  if (!s) return ''
  const map: Record<string, string> = {
    '国語': '国', '算数': '算', '数学': '数', '英語': '英',
    '理科': '理', '社会': '社', '物理': '物', '化学': '化',
    '生物': '生', '地理': '地', '歴史': '歴', '国算': '国算',
  }
  return map[s] ?? s.slice(0, 2)
}

export default async function MonthlyPreviewPage({ searchParams }: PageProps) {
  const { year: yearStr, month: monthStr, type, id, showTeacher: showTeacherStr } = await searchParams
  const showTeacher = showTeacherStr !== 'false'  // デフォルトは表示
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

  // 日付ごとにまとめる
  const byDate = new Map<string, typeof entries>()
  for (const entry of entries) {
    if (!byDate.has(entry.dateStr)) byDate.set(entry.dateStr, [])
    byDate.get(entry.dateStr)!.push(entry)
  }

  // 講師ビュー: このコマ・この日に振替で入る生徒（`${lesson_id}__${date}` -> 生徒）
  const makeupByLessonDate = new Map<string, { id: string; name: string }[]>()
  if (type === 'teacher') {
    for (const m of makeups) {
      if (!m.student || m.lesson?.teacher_id !== id) continue
      const k = `${m.lesson_id}__${m.assigned_date}`
      if (!makeupByLessonDate.has(k)) makeupByLessonDate.set(k, [])
      makeupByLessonDate.get(k)!.push(m.student)
    }
  }

  // 生徒ビュー: この生徒の振替コマ（日付 -> 一覧）
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

  const allDates = new Set([...byDate.keys(), ...studentMakeupsByDate.keys()])
  const maxEntriesPerDay = Math.max(
    1,
    ...Array.from(allDates).map((d) =>
      (byDate.get(d)?.length ?? 0) + (studentMakeupsByDate.get(d)?.length ?? 0)
    )
  )
  const zoomLevel =
    maxEntriesPerDay <= 3 ? 0.85 :
    maxEntriesPerDay <= 5 ? 0.68 :
    maxEntriesPerDay <= 7 ? 0.55 :
    0.42

  // カレンダー行列を構築
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startDow = firstDay.getDay() // 0=Sun

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

  const printDate = new Date().toLocaleDateString('ja-JP')

  const pad = (n: number) => String(n).padStart(2, '0')
  const dayNumToDateStr = (day: number) => `${year}-${pad(month)}-${pad(day)}`

  return (
    <div className="print-root bg-white min-h-screen">
      <AutoPrint />
      {/* @page設定・印刷縮小 */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          .no-print { display: none !important; }
          #monthly-print-area {
            zoom: ${zoomLevel};
            padding: 5mm;
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
        <div className="flex items-end justify-between mb-4 pb-3 border-b-2 border-navy print:mb-3">
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
        <table className="w-full border-collapse text-xs table-fixed">
          <thead>
            <tr>
              {DOW_LABELS.map((d, i) => (
                <th key={d} className={[
                  'border border-gray-300 py-1.5 text-center text-xs font-bold',
                  i === 0 ? 'text-red-600 bg-red-50' : i === 6 ? 'text-blue-600 bg-blue-50' : 'text-gray-700 bg-gray-100',
                ].join(' ')}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day, di) => {
                  const isSun = di === 0
                  const isSat = di === 6
                  const dateStr = day ? dayNumToDateStr(day) : null
                  const dayEntries = dateStr ? (byDate.get(dateStr) ?? []) : []
                  const hasLesson = dayEntries.length > 0 || (dateStr ? (studentMakeupsByDate.get(dateStr)?.length ?? 0) > 0 : false)

                  return (
                    <td key={di} className={[
                      'border border-gray-300 p-0',
                      !day ? 'bg-gray-50' : '',
                      isSun && day ? 'bg-red-50/30' : '',
                      isSat && day ? 'bg-blue-50/30' : '',
                    ].join(' ')}
                      style={{ width: '14.28%' }}
                    >
                      {/* 高さ固定・はみ出し非表示のコンテナ */}
                      <div
                        className="print:h-auto overflow-hidden p-1 flex flex-col"
                        style={{ minHeight: dayEntries.length > 4 ? '15rem' : '13rem' }}
                      >
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

                          {/* その日のコマ */}
                          <div className="space-y-0.5 overflow-hidden">
                            {dayEntries.map(({ lesson, timeLabel }, ei) => {
                              // 時間（開始時刻のみ）
                              const startTime = timeLabel.split('〜')[0]

                              if (type === 'teacher') {
                                // 先生ビュー: 生徒一覧を表示
                                const enrolledStudents = (lesson.enrollments ?? [])
                                  .filter(e => e.student != null)
                                  .map(e => ({
                                    name: (e as { student?: { name: string } }).student?.name ?? '',
                                    subject: (e as { subject?: string | null }).subject ?? lesson.subject ?? '',
                                  }))
                                return (
                                  <div key={ei} className="bg-teal-50 border border-teal-200 rounded px-1 py-0.5">
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
                                    {(makeupByLessonDate.get(`${lesson.id}__${dateStr}`) ?? []).map((mk, mi) => (
                                      <p key={`mk-${mi}`} className="text-[9px] font-bold text-amber-800 bg-amber-100 rounded px-0.5 leading-tight truncate">
                                        {mk.name}（振替）
                                      </p>
                                    ))}
                                  </div>
                                )
                              } else {
                                // 生徒ビュー: 先生と科目を表示
                                const enrollment = (lesson.enrollments ?? []).find(e => e.student_id === id)
                                const mySubject = (enrollment as { subject?: string | null } | undefined)?.subject ?? lesson.subject
                                const teacherName = (lesson as { teacher?: { name: string } }).teacher?.name
                                const isGroup = lesson.type === 'group'
                                return (
                                  <div key={ei} className={[
                                    'border rounded px-1 py-0.5',
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
                                )
                              }
                            })}
                            {/* 生徒ビュー: 振替コマ（アンバー表示） */}
                            {dateStr && (studentMakeupsByDate.get(dateStr) ?? []).map((mk, mi) => (
                              <div key={`mk-${mi}`} className="bg-amber-50 border border-amber-300 rounded px-1 py-0.5">
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
                            ))}
                          </div>
                        </>
                      )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer */}
        <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
          <span>全{entries.length + studentMakeupCount}コマ{studentMakeupCount > 0 ? `（うち振替${studentMakeupCount}）` : ''}</span>
          <span className="hidden print:inline">塾スケジュール管理システム</span>
        </div>
      </div>
    </div>
  )
}
