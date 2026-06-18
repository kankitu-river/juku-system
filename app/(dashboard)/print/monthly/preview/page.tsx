import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { expandLessonsForMonth } from '@/lib/utils/schedule'
import type { Lesson, TermPeriod } from '@/types'
import { PrintButton } from '@/components/print/PrintButton'
import { getDisplayGrade } from '@/lib/utils/grade'

interface PageProps {
  searchParams: Promise<{
    year?: string
    month?: string
    type?: string
    id?: string
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
  const { year: yearStr, month: monthStr, type, id } = await searchParams
  const year = Number(yearStr ?? new Date().getFullYear())
  const month = Number(monthStr ?? new Date().getMonth() + 1)
  const monthLabel = `${year}年${month}月`

  if (!type || !id || !['teacher', 'student'].includes(type)) {
    return <div className="p-8 text-red-500">パラメータが不正です</div>
  }

  const supabase = await createClient()

  const [{ data: termPeriods }, { data: lessons }] = await Promise.all([
    supabase.from('term_periods').select('*').order('start_date'),
    supabase
      .from('lessons')
      .select('*, teacher:teachers(id, name), enrollments:lesson_enrollments(student_id, subject, student:students(id, name))')
      .order('day_of_week')
      .order('slot_index'),
  ])

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
  const toDateStr = (day: number) => `${year}-${pad(month)}-${pad(day)}`

  return (
    <div className="bg-white min-h-screen">
      {/* @page設定・印刷縮小 */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          .no-print { display: none !important; }
          #monthly-print-area {
            zoom: 0.58;
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
        <PrintButton label="印刷（PDF保存）" />
      </div>

      {/* Print content */}
      <div id="monthly-print-area" className="p-6">
        {/* Header */}
        <div className="flex items-end justify-between mb-4 pb-3 border-b-2 border-[#1E3A5F] print:mb-3">
          <div>
            <p className="text-xs text-gray-500">月次スケジュール</p>
            <h1 className="text-2xl font-bold text-[#1E3A5F]">{personName}</h1>
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
                  const dateStr = day ? toDateStr(day) : null
                  const dayEntries = dateStr ? (byDate.get(dateStr) ?? []) : []
                  const hasLesson = dayEntries.length > 0

                  return (
                    <td key={di} className={[
                      'border border-gray-300 align-top p-1',
                      'h-24 print:h-16',
                      !day ? 'bg-gray-50' : '',
                      isSun && day ? 'bg-red-50/30' : '',
                      isSat && day ? 'bg-blue-50/30' : '',
                    ].join(' ')}
                      style={{ width: '14.28%' }}
                    >
                      {day && (
                        <>
                          {/* 日付 */}
                          <div className={[
                            'font-bold text-sm leading-none mb-1',
                            isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700',
                            hasLesson ? 'text-[#1E3A5F]' : '',
                          ].join(' ')}>
                            {day}
                          </div>

                          {/* その日のコマ */}
                          <div className="space-y-0.5">
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
                                    <p className="text-[9px] text-teal-600 font-bold leading-none">{startTime}</p>
                                    {enrolledStudents.length > 0 ? (
                                      enrolledStudents.map((s, si) => (
                                        <p key={si} className="text-[9px] text-gray-800 leading-tight truncate">
                                          {s.name}{s.subject ? `（${shortSubject(s.subject)}）` : ''}
                                        </p>
                                      ))
                                    ) : (
                                      <p className="text-[9px] text-gray-400 leading-tight">{lesson.subject || '—'}</p>
                                    )}
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
                                      'text-[9px] font-bold leading-none',
                                      isGroup ? 'text-purple-600' : 'text-teal-600',
                                    ].join(' ')}>{startTime}</p>
                                    {teacherName && (
                                      <p className="text-[9px] text-gray-800 leading-tight truncate">{teacherName}先生</p>
                                    )}
                                    {mySubject && (
                                      <p className="text-[9px] text-gray-500 leading-tight">{mySubject}</p>
                                    )}
                                  </div>
                                )
                              }
                            })}
                          </div>
                        </>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer */}
        <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
          <span>全{entries.length}コマ</span>
          <span className="hidden print:inline">塾スケジュール管理システム</span>
        </div>
      </div>
    </div>
  )
}
