import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { TodayLessons } from '@/components/dashboard/TodayLessons'
import { UnrecordedAlert, type UnrecordedLesson } from '@/components/dashboard/UnrecordedAlert'
import { Card } from '@/components/ui/Card'
import Link from 'next/link'
import { getDisplayGrade } from '@/lib/utils/grade'
import { getJstNow, getJstTodayStr } from '@/lib/utils/datetime'
import { getSlotsForLesson } from '@/lib/constants/timeSlots'

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = getJstNow()
  const todayStr = getJstTodayStr()
  const displayDate = today.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  const dayOfWeek = today.getDay() // 0=日曜

  const [
    { data: lessons },
    { data: termPeriods },
    { data: makeupCredits },
    { data: students },
    { data: todayShifts },
  ] = await Promise.all([
    supabase
      .from('lessons')
      .select('*, teacher:teachers(name), enrollments:lesson_enrollments(student:students(id, name, grade)), attendances(student_id, status, date)')
      .eq('day_of_week', dayOfWeek)
      .eq('attendances.date', todayStr)
      .order('slot_index'),
    supabase.from('term_periods').select('*')
      .lte('start_date', todayStr)
      .gte('end_date', todayStr),
    supabase.from('makeup_credits').select('student_id, total_credits, used_credits'),
    supabase.from('students').select('id, name, grade'),
    supabase.from('shifts').select('teacher_id').eq('date', todayStr),
  ])

  const workingTeacherCount = new Set((todayShifts ?? []).map(s => s.teacher_id)).size

  const currentTerm = termPeriods?.[0]

  const creditWithStudents = (makeupCredits ?? [])
    .map((mc) => ({
      ...mc,
      remaining: mc.total_credits - mc.used_credits,
      student: (students ?? []).find((s) => s.id === mc.student_id),
    }))
    .filter((mc) => mc.student)

  // 振替が3件以上たまっている生徒
  const highCreditStudents = creditWithStudents.filter((mc) => mc.remaining >= 3)
  // 振替残数が1以下（少ない）生徒
  const lowCreditStudents = creditWithStudents.filter((mc) => mc.remaining <= 1 && mc.remaining > 0)

  // 今日実際にあるコマ（期間区分と臨時コマの特定日でフィルタ）
  const termType = (currentTerm?.type as 'regular' | 'intensive') ?? 'regular'
  const todayLessons = (lessons ?? []).filter((l) =>
    l.lesson_kind === 'temporary' ? l.specific_date === todayStr : l.term_type === termType
  )

  // 出欠未入力アラート用データ（終了時刻の判定はクライアント側）
  const unrecordedLessons: UnrecordedLesson[] = todayLessons
    .map((l) => {
      const enrolledIds = (l.enrollments ?? [])
        .map((e: { student: { id: string } | null }) => e.student?.id)
        .filter(Boolean) as string[]
      const recordedIds = new Set((l.attendances ?? []).map((a: { student_id: string }) => a.student_id))
      const unrecordedCount = enrolledIds.filter((id) => !recordedIds.has(id)).length
      const slots = getSlotsForLesson(l.type, l.day_of_week, l.term_type)
      const slot = slots.find((s) => s.index === l.slot_index)
      return {
        lessonId: l.id as string,
        slotIndex: l.slot_index as number,
        timeLabel: slot ? `${slot.start}〜${slot.end}` : '',
        endTime: slot?.end ?? '23:59',
        teacherName: (l.teacher as { name: string } | null)?.name ?? null,
        unrecordedCount,
      }
    })
    .filter((l) => l.unrecordedCount > 0)

  return (
    <div>
      <Header title="ダッシュボード" subtitle={displayDate} />

      {/* 出欠未入力アラート（終了済みコマ） */}
      <UnrecordedAlert lessons={unrecordedLessons} />

      {/* 振替がたまりすぎ警告 */}
      {highCreditStudents.length > 0 && (
        <div className="mb-4 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-orange-600 dark:text-orange-300 font-semibold text-sm">📌 振替が3件以上たまっている生徒</span>
            <Link href="/attendance/makeup" className="ml-auto text-xs text-orange-700 dark:text-orange-300 hover:underline">
              振替管理へ →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {highCreditStudents.map((mc) => (
              <Link
                key={mc.student_id}
                href={`/students/${mc.student_id}`}
                className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-900 rounded-lg px-3 py-1.5 hover:border-orange-400 transition-colors"
              >
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{mc.student!.name}</span>
                <span className="text-xs text-gray-400">{getDisplayGrade(mc.student!.grade)}</span>
                <span className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300">
                  残{mc.remaining}件
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 振替残数が少ない警告 */}
      {lowCreditStudents.length > 0 && (
        <div className="mb-6 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-600 dark:text-amber-300 font-semibold text-sm">⚠ 振替残数が少ない生徒</span>
            <Link href="/attendance/makeup" className="ml-auto text-xs text-amber-700 dark:text-amber-300 hover:underline">
              振替管理へ →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowCreditStudents.map((mc) => (
              <Link
                key={mc.student_id}
                href={`/students/${mc.student_id}`}
                className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-1.5 hover:border-amber-400 transition-colors"
              >
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{mc.student!.name}</span>
                <span className="text-xs text-gray-400">{getDisplayGrade(mc.student!.grade)}</span>
                <span className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                  残{mc.remaining}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">今日のコマ数</p>
          <p className="text-3xl font-bold text-navy dark:text-blue-300">
            {todayLessons.length}
            <span className="text-base font-normal text-gray-500 dark:text-gray-400 ml-1">コマ</span>
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">現在の期間区分</p>
          <p className="text-xl font-bold text-navy dark:text-blue-300">
            {currentTerm ? currentTerm.name : '通常期間'}
          </p>
          {currentTerm && (
            <p className="text-xs text-gray-400 mt-1">
              〜 {new Date(currentTerm.end_date).toLocaleDateString('ja-JP')}
            </p>
          )}
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">本日出勤講師数</p>
          <p className="text-3xl font-bold text-navy dark:text-blue-300">
            {workingTeacherCount}
            <span className="text-base font-normal text-gray-500 dark:text-gray-400 ml-1">名</span>
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">クイックリンク</p>
          <div className="flex flex-wrap gap-2 mt-1">
            <Link href="/schedule/new" className="text-sm text-navy dark:text-blue-300 hover:underline font-medium">
              + コマ追加
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/students/new" className="text-sm text-navy dark:text-blue-300 hover:underline font-medium">
              + 生徒追加
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/attendance/makeup" className="text-sm text-navy dark:text-blue-300 hover:underline font-medium">
              振替管理
            </Link>
          </div>
        </Card>
      </div>

      {/* 今日のコマ + 出欠クイック入力 */}
      <Card
        title="今日のコマと出欠入力"
        padding="none"
        action={
          <Link href="/schedule" className="text-sm text-navy dark:text-blue-300 hover:underline">
            週次カレンダー →
          </Link>
        }
      >
        <TodayLessons
          lessons={todayLessons as any}
          todayStr={todayStr}
          dayOfWeek={dayOfWeek}
          termType={termType}
        />
      </Card>
    </div>
  )
}
