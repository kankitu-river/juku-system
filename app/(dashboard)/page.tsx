import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { TodayLessons } from '@/components/dashboard/TodayLessons'
import { UnrecordedAlert, type UnrecordedLesson } from '@/components/dashboard/UnrecordedAlert'
import { WeeklySummary } from '@/components/dashboard/WeeklySummary'
import { Card } from '@/components/ui/Card'
import Link from 'next/link'
import { getDisplayGrade } from '@/lib/utils/grade'
import { getJstNow, getJstTodayStr } from '@/lib/utils/datetime'
import { getSlotsForLesson } from '@/lib/constants/timeSlots'
import type { LessonWithRelations } from '@/types'

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
  const termType = (currentTerm?.type as 'regular' | 'intensive') ?? 'regular'

  // 講師別週次コマ数（現期間区分の通常コマ）
  const { data: regularLessons } = await supabase
    .from('lessons')
    .select('teacher_id, teacher:teachers(id, name)')
    .eq('term_type', termType)
    .eq('lesson_kind', 'regular')
    .not('teacher_id', 'is', null)

  // 今週の臨時コマ（当週 月〜日の specific_date）
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7)) // 月曜起点
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const weekEndStr = weekEnd.toISOString().slice(0, 10)

  const { data: tempLessonsThisWeek } = await supabase
    .from('lessons')
    .select('teacher_id, teacher:teachers(id, name)')
    .eq('lesson_kind', 'temporary')
    .gte('specific_date', weekStartStr)
    .lte('specific_date', weekEndStr)
    .not('teacher_id', 'is', null)

  // 講師別合計コマ数を集計
  const teacherLoadMap = new Map<string, { name: string; count: number }>()
  for (const l of [...(regularLessons ?? []), ...(tempLessonsThisWeek ?? [])]) {
    const tid = l.teacher_id as string
    const name = (l.teacher as unknown as { name: string } | null)?.name ?? ''
    const existing = teacherLoadMap.get(tid)
    if (existing) existing.count++
    else teacherLoadMap.set(tid, { name, count: 1 })
  }
  const allLoads = Array.from(teacherLoadMap.values())
  const avgLoad = allLoads.length > 0
    ? allLoads.reduce((s, t) => s + t.count, 0) / allLoads.length
    : 0
  const overloadedTeachers = allLoads
    .filter((t) => avgLoad > 0 && t.count > avgLoad * 1.5)
    .sort((a, b) => b.count - a.count)

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

  // 振替滞留アラート: 未消化のクレジットがあり最古の欠席が14日以上前の生徒
  const twoWeeksAgo = new Date(today)
  twoWeeksAgo.setDate(today.getDate() - 14)
  const stalenessCutoff = twoWeeksAgo.toISOString().slice(0, 10)

  const pendingStudentIds = creditWithStudents
    .filter((mc) => mc.remaining > 0)
    .map((mc) => mc.student_id)

  let staleStudents: Array<{ studentId: string; name: string; grade: string; pending: number; oldestDate: string; daysSince: number }> = []

  if (pendingStudentIds.length > 0) {
    const { data: oldAbsences } = await supabase
      .from('attendances')
      .select('student_id, date')
      .in('student_id', pendingStudentIds)
      .eq('makeup_credited', true)
      .lte('date', stalenessCutoff)
      .order('date', { ascending: true })

    if (oldAbsences && oldAbsences.length > 0) {
      const oldestByStudent = new Map<string, string>()
      for (const a of oldAbsences) {
        if (!oldestByStudent.has(a.student_id as string)) {
          oldestByStudent.set(a.student_id as string, a.date as string)
        }
      }
      staleStudents = creditWithStudents
        .filter((mc) => mc.remaining > 0 && oldestByStudent.has(mc.student_id))
        .map((mc) => {
          const oldest = oldestByStudent.get(mc.student_id)!
          const msElapsed = today.getTime() - new Date(oldest).getTime()
          const daysSince = Math.floor(msElapsed / 86400000)
          return {
            studentId: mc.student_id,
            name: mc.student!.name,
            grade: mc.student!.grade,
            pending: mc.remaining,
            oldestDate: oldest,
            daysSince,
          }
        })
        .sort((a, b) => b.daysSince - a.daysSince)
    }
  }

  // 今日実際にあるコマ（期間区分と臨時コマの特定日でフィルタ）
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

  // キャンセル待ちがあり空きがあるコマ
  const { data: waitlistAlerts } = await supabase
    .from('waitlist')
    .select('lesson_id, lesson:lessons(id, subject, day_of_week, slot_index, capacity, lesson_enrollments(id))')
    .eq('status', 'waiting')

  type WaitlistAlertLesson = { id: string; subject: string | null; day_of_week: number; slot_index: number; capacity: number; lesson_enrollments: { id: string }[] }
  const waitlistLessonMap = new Map<string, WaitlistAlertLesson & { waitlistCount: number }>()
  for (const w of waitlistAlerts ?? []) {
    const lesson = w.lesson as unknown as WaitlistAlertLesson | null
    if (!lesson) continue
    const enrollCount = lesson.lesson_enrollments?.length ?? 0
    if (enrollCount >= lesson.capacity) continue  // 空きなし
    const existing = waitlistLessonMap.get(lesson.id)
    if (existing) existing.waitlistCount++
    else waitlistLessonMap.set(lesson.id, { ...lesson, waitlistCount: 1 })
  }
  const lessonsWithWaitlistAndVacancy = Array.from(waitlistLessonMap.values())

  // ダッシュボード用: 7日以内に締め切りがある未完了タスク
  const dashboardCutoff = new Date(today)
  dashboardCutoff.setDate(dashboardCutoff.getDate() + 7)
  const dashboardCutoffStr = dashboardCutoff.toISOString().slice(0, 10)

  const { data: upcomingTasks } = await supabase
    .from('tasks')
    .select('id, title, due_date, status')
    .in('status', ['pending', 'in_progress'])
    .is('dismissed_at', null)
    .lte('due_date', dashboardCutoffStr)
    .order('due_date', { ascending: true })
    .limit(5)

  type UpcomingTask = { id: string; title: string; due_date: string; status: string }

  return (
    <div>
      <Header title="ダッシュボード" subtitle={displayDate} />

      {/* 出欠未入力アラート（終了済みコマ） */}
      <UnrecordedAlert lessons={unrecordedLessons} />

      {/* 振替滞留アラート（14日以上未確定） */}
      {staleStudents.length > 0 && (
        <div className="mb-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-rose-600 dark:text-rose-300 font-semibold text-sm">
              ⏰ 振替が14日以上未確定の生徒
            </span>
            <Link href="/attendance/makeup" className="ml-auto text-xs text-rose-700 dark:text-rose-300 hover:underline">
              振替管理へ →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {staleStudents.map((s) => (
              <Link
                key={s.studentId}
                href={`/students/${s.studentId}`}
                className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-1.5 hover:border-rose-400 transition-colors"
              >
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{s.name}</span>
                <span className="text-xs text-gray-400">{getDisplayGrade(s.grade)}</span>
                <span className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                  {s.daysSince}日経過
                </span>
                <span className="text-xs text-rose-500 dark:text-rose-400">残{s.pending}件</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* キャンセル待ちがあり空きが出たコマ */}
      {lessonsWithWaitlistAndVacancy.length > 0 && (
        <div className="mb-4 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-purple-700 dark:text-purple-300 font-semibold text-sm">
              空席あり・キャンセル待ちの生徒がいるコマ
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lessonsWithWaitlistAndVacancy.map((l) => {
              const dayNames = ['日','月','火','水','木','金','土']
              return (
                <Link
                  key={l.id}
                  href={`/schedule/${l.id}`}
                  className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-900 rounded-lg px-3 py-1.5 hover:border-purple-400 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {l.subject ?? '(科目未設定)'} {dayNames[l.day_of_week]}曜 第{l.slot_index}コマ
                  </span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                    待{l.waitlistCount}名
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* 講師負荷バランス警告 */}
      {overloadedTeachers.length > 0 && (
        <div className="mb-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-red-600 dark:text-red-300 font-semibold text-sm">
              ⚠ 負荷が集中している講師（週平均 {avgLoad.toFixed(1)} コマの1.5倍超）
            </span>
            <Link href="/teachers" className="ml-auto text-xs text-red-700 dark:text-red-300 hover:underline">
              先生管理 →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {overloadedTeachers.map((t) => (
              <div
                key={t.name}
                className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900 rounded-lg px-3 py-1.5"
              >
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.name}</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300">
                  週{t.count}コマ
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* AI 週次サマリー */}
      <div className="mb-4">
        <WeeklySummary />
      </div>

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

      {/* 期限が近いタスク */}
      {((upcomingTasks ?? []) as UpcomingTask[]).length > 0 && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">今後7日以内のタスク</h3>
            <Link href="/tasks" className="text-xs text-navy dark:text-blue-300 hover:underline">すべて見る →</Link>
          </div>
          <div className="space-y-2">
            {((upcomingTasks ?? []) as UpcomingTask[]).map((t) => {
              const d = new Date(t.due_date)
              const today0 = new Date(todayStr)
              today0.setHours(0, 0, 0, 0)
              d.setHours(0, 0, 0, 0)
              const days = Math.ceil((d.getTime() - today0.getTime()) / 86400000)
              const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`
              return (
                <div key={t.id} className="flex items-center gap-3 text-sm">
                  <span className={[
                    'w-2 h-2 rounded-full flex-shrink-0',
                    days < 0 ? 'bg-red-400' : days === 0 ? 'bg-orange-400' : days <= 3 ? 'bg-amber-400' : 'bg-blue-300',
                  ].join(' ')} />
                  <span className="flex-1 text-gray-700 dark:text-gray-200">{t.title}</span>
                  <span className={[
                    'text-xs',
                    days < 0 ? 'text-red-500 font-semibold' : days === 0 ? 'text-orange-500 font-semibold' : 'text-gray-400',
                  ].join(' ')}>
                    {days < 0 ? `${Math.abs(days)}日超過` : days === 0 ? '今日' : `${dateLabel}まで`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
          lessons={todayLessons as LessonWithRelations[]}
          todayStr={todayStr}
          dayOfWeek={dayOfWeek}
          termType={termType}
        />
      </Card>
    </div>
  )
}
