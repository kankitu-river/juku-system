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

const DAY_NAMES: Record<number, string> = {
  0: '日', 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土',
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
      .select('*, teacher:teachers(id, name), enrollments:lesson_enrollments(student_id)')
      .order('day_of_week')
      .order('slot_index'),
  ])

  const typedTermPeriods = (termPeriods as TermPeriod[]) ?? []
  const typedLessons = (lessons as Lesson[]) ?? []

  let personName = ''
  let personSub = ''
  let titlePrefix = ''
  let filteredLessons: Lesson[] = []

  if (type === 'teacher') {
    const { data: teacher } = await supabase
      .from('teachers')
      .select('id, name, subjects')
      .eq('id', id)
      .single()
    if (!teacher) return <div className="p-8 text-red-500">先生が見つかりません</div>
    personName = teacher.name
    personSub = (teacher.subjects as string[] | null)?.join('・') ?? ''
    titlePrefix = '担当スケジュール'
    filteredLessons = typedLessons.filter((l) => l.teacher_id === teacher.id)
  } else {
    const { data: student } = await supabase
      .from('students')
      .select('id, name, grade')
      .eq('id', id)
      .single()
    if (!student) return <div className="p-8 text-red-500">生徒が見つかりません</div>
    personName = student.name
    personSub = student.grade ? getDisplayGrade(student.grade) : ''
    titlePrefix = '受講スケジュール'
    filteredLessons = typedLessons.filter((l) =>
      (l.enrollments ?? []).some((e) => e.student_id === student.id)
    )
  }

  const entries = expandLessonsForMonth(filteredLessons, year, month, typedTermPeriods)
  const printDate = new Date().toLocaleDateString('ja-JP')

  return (
    <div className="bg-white min-h-screen">
      {/* Controls */}
      <div className="no-print bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/print/monthly" className="text-sm text-gray-500 hover:text-gray-700">← 月次印刷に戻る</Link>
          <span className="text-sm font-medium text-gray-700">{monthLabel} · {personName}</span>
        </div>
        <PrintButton label="印刷（PDF保存）" />
      </div>

      {/* Print content */}
      <div className="max-w-2xl mx-auto p-8 print:p-0 print:max-w-none">
        {/* Header */}
        <div className="mb-6 pb-4 border-b-2 border-[#1E3A5F]">
          <h1 className="text-xl font-bold text-[#1E3A5F]">月次{titlePrefix}</h1>
          <p className="text-base text-gray-600 mt-1">{monthLabel}</p>
          <div className="mt-2">
            <p className="text-2xl font-bold text-gray-900">{personName}</p>
            {personSub && <p className="text-sm text-gray-500 mt-0.5">{personSub}</p>}
          </div>
        </div>

        {/* Schedule table */}
        {entries.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p>この月のスケジュールはありません</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#1E3A5F] text-white">
                <th className="text-left px-3 py-2 border border-gray-300 w-20">日付</th>
                <th className="text-left px-3 py-2 border border-gray-300 w-10">曜</th>
                <th className="text-left px-3 py-2 border border-gray-300 w-36">時間帯</th>
                <th className="text-left px-3 py-2 border border-gray-300">コマ名</th>
                <th className="text-left px-3 py-2 border border-gray-300 w-20">科目</th>
                {type === 'student' && (
                  <th className="text-left px-3 py-2 border border-gray-300 w-24">担当講師</th>
                )}
                <th className="text-left px-3 py-2 border border-gray-300 w-16">種別</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ date, dateStr, lesson, timeLabel }, i) => (
                <tr
                  key={`${lesson.id}-${dateStr}`}
                  className={i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}
                >
                  <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">
                    {date.getMonth() + 1}/{date.getDate()}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-600">
                    {DAY_NAMES[date.getDay()]}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-600 text-xs">
                    {timeLabel}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 font-medium text-gray-900">
                    {lesson.title}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-600 text-xs">
                    {lesson.subject ?? '—'}
                  </td>
                  {type === 'student' && (
                    <td className="px-3 py-2 border border-gray-200 text-gray-600 text-xs">
                      {(lesson as { teacher?: { name: string } }).teacher?.name ?? '—'}
                    </td>
                  )}
                  <td className="px-3 py-2 border border-gray-200 text-xs">
                    <span className={[
                      'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                      lesson.type === 'group'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-teal-100 text-teal-700',
                    ].join(' ')}>
                      {lesson.type === 'group' ? '集団' : '個別'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {entries.length > 0 && (
          <p className="text-right text-xs text-gray-400 mt-2">全{entries.length}コマ</p>
        )}

        {/* Footer */}
        <div className="hidden print:flex mt-8 pt-3 border-t border-gray-300 text-xs text-gray-400 justify-between">
          <span>塾スケジュール管理システム</span>
          <span>印刷日: {printDate}</span>
        </div>
      </div>
    </div>
  )
}
