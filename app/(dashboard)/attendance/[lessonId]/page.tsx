import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { AttendanceSheet } from '@/components/attendance/AttendanceSheet'
import { Badge } from '@/components/ui/Badge'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSlotLabel } from '@/lib/constants/timeSlots'
import { getJstTodayStr } from '@/lib/utils/datetime'
import type { Lesson } from '@/types'

interface PageProps {
  params: Promise<{ lessonId: string }>
  searchParams: Promise<{ date?: string }>
}

export default async function LessonAttendancePage({ params, searchParams }: PageProps) {
  const { lessonId } = await params
  const { date } = await searchParams
  const dateStr = date ?? getJstTodayStr()
  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  const supabase = await createClient()

  const [{ data: lesson }, { data: attendances }] = await Promise.all([
    supabase
      .from('lessons')
      .select(`
        *,
        teacher:teachers(id, name),
        enrollments:lesson_enrollments(
          id, student_id,
          student:students(id, name, grade, is_trial)
        )
      `)
      .eq('id', lessonId)
      .single(),
    supabase
      .from('attendances')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('date', dateStr),
  ])

  if (!lesson) notFound()

  const typedLesson = lesson as Lesson
  const slotLabel = getSlotLabel(
    typedLesson.slot_index,
    typedLesson.day_of_week,
    typedLesson.term_type,
    typedLesson.type
  )

  const attendanceMap = new Map<string, string>()
  for (const a of attendances ?? []) {
    attendanceMap.set(a.student_id, a.status)
  }

  const entries = (typedLesson.enrollments ?? []).map((e) => ({
    studentId: e.student_id,
    studentName: e.student?.name ?? '不明',
    studentGrade: (e.student as { grade?: string })?.grade ?? '',
    isTrial: (e.student as { is_trial?: boolean })?.is_trial ?? false,
    currentStatus: (attendanceMap.get(e.student_id) ?? null) as 'present' | 'absent' | 'makeup_used' | null,
  }))

  const presentCount = entries.filter((e) => e.currentStatus === 'present').length
  const absentCount = entries.filter((e) => e.currentStatus === 'absent').length

  return (
    <div>
      <div className="mb-2">
        <Link href={`/attendance?date=${dateStr}`} className="text-sm text-gray-400 hover:text-gray-600">
          ← 出欠管理に戻る
        </Link>
      </div>

      <Header
        title={`第${typedLesson.slot_index}コマ　${typedLesson.teacher?.name ? `${typedLesson.teacher.name}先生` : '担当未設定'}`}
        subtitle={`${dateLabel} · ${slotLabel}`}
        actions={
          <div className="flex gap-2">
            <Badge variant={typedLesson.type === 'group' ? 'group' : 'individual'}>
              {typedLesson.type === 'group' ? '集団授業' : '個別指導'}
            </Badge>
          </div>
        }
      />

      {/* 集計バー */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{entries.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">登録生徒</p>
        </div>
        <div className="bg-green-50 dark:bg-green-950/40 rounded-xl border border-green-100 shadow-sm px-4 py-3 text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-300">{presentCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">出席</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-100 shadow-sm px-4 py-3 text-center">
          <p className="text-2xl font-bold text-red-500">{absentCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">欠席</p>
        </div>
      </div>

      {/* 担当講師 */}
      {typedLesson.teacher?.name && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          担当：<span className="font-medium text-gray-700 dark:text-gray-300">{typedLesson.teacher.name}</span>
        </p>
      )}

      <AttendanceSheet
        lessonId={lessonId}
        date={dateStr}
        entries={entries}
      />
    </div>
  )
}
