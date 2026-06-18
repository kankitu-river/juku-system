import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import type { Lesson } from '@/types'
import { getSlotLabel } from '@/lib/constants/timeSlots'

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const { date } = await searchParams
  const targetDate = date ? new Date(date) : new Date()
  const dateStr = targetDate.toISOString().split('T')[0]
  const dayOfWeek = targetDate.getDay() // 0=日

  const dateLabel = targetDate.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  const prevDate = new Date(targetDate); prevDate.setDate(prevDate.getDate() - 1)
  const nextDate = new Date(targetDate); nextDate.setDate(nextDate.getDate() + 1)

  const supabase = await createClient()

  // 今日のコマ（day_of_weekで絞り込み）
  const { data: lessons } = await supabase
    .from('lessons')
    .select(`
      *,
      teacher:teachers(id, name),
      enrollments:lesson_enrollments(
        id, student_id,
        student:students(id, name)
      )
    `)
    .eq('day_of_week', dayOfWeek)
    .order('slot_index')

  // 今日の出欠記録
  const { data: attendances } = await supabase
    .from('attendances')
    .select('*')
    .eq('date', dateStr)

  const attendanceMap = new Map<string, string>()
  for (const a of attendances ?? []) {
    attendanceMap.set(`${a.student_id}-${a.lesson_id}`, a.status)
  }

  const typedLessons = (lessons as Lesson[]) ?? []

  function getCompletionRate(lesson: Lesson): { present: number; total: number } {
    const enrolled = lesson.enrollments ?? []
    const present = enrolled.filter(
      (e) => attendanceMap.get(`${e.student_id}-${lesson.id}`) === 'present'
    ).length
    return { present, total: enrolled.length }
  }

  return (
    <div>
      <Header title="出欠管理" subtitle={dateLabel} />

      {/* 日付ナビゲーション */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/attendance?date=${prevDate.toISOString().split('T')[0]}`}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
        >
          ‹ 前日
        </Link>
        <Link
          href="/attendance"
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
        >
          今日
        </Link>
        <Link
          href={`/attendance?date=${nextDate.toISOString().split('T')[0]}`}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
        >
          翌日 ›
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/attendance/report" className="text-sm text-[#1E3A5F] font-medium hover:underline">
            集計レポート →
          </Link>
          <Link href="/attendance/makeup" className="text-sm text-[#1E3A5F] font-medium hover:underline">
            振替管理 →
          </Link>
        </div>
      </div>

      {typedLessons.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-400 text-sm">この日のコマはありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {typedLessons.map((lesson) => {
            const { present, total } = getCompletionRate(lesson)
            const allDone = total > 0 && present + (lesson.enrollments ?? []).filter(
              (e) => attendanceMap.get(`${e.student_id}-${lesson.id}`)
            ).length === total
            const slotLabel = getSlotLabel(lesson.slot_index, lesson.day_of_week, lesson.term_type, lesson.type)

            return (
              <Link
                key={lesson.id}
                href={`/attendance/${lesson.id}?date=${dateStr}`}
                className={[
                  'flex items-center gap-4 bg-white rounded-xl border shadow-sm px-5 py-4 hover:border-[#1E3A5F] transition-colors',
                  allDone ? 'border-green-200 bg-green-50/30' : 'border-gray-100',
                ].join(' ')}
              >
                <div className={[
                  'w-1.5 h-12 rounded-full flex-shrink-0',
                  lesson.type === 'group' ? 'bg-purple-400' : 'bg-teal-400',
                ].join(' ')} />

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">
                    {lesson.teacher?.name ? `${lesson.teacher.name}先生` : '担当未設定'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {slotLabel} · {lesson.type === 'group' ? '集団授業' : '個別指導'}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {total > 0 ? (
                    <div className="text-right">
                      <p className={[
                        'text-sm font-bold',
                        allDone ? 'text-green-600' : 'text-gray-700',
                      ].join(' ')}>
                        {present}/{total}
                      </p>
                      <p className="text-[10px] text-gray-400">出席/登録</p>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300">生徒未登録</span>
                  )}
                  <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
