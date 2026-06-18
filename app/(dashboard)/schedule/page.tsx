import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { WeeklyCalendar } from '@/components/schedule/WeeklyCalendar'
import { ScheduleFilter } from '@/components/schedule/ScheduleFilter'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import Link from 'next/link'
import type { Lesson, TermPeriod, Teacher, Student } from '@/types'
import type { TimeSlotConfig } from '@/app/(dashboard)/settings/actions'

interface PageProps {
  searchParams: Promise<{ view?: string; date?: string }>
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const { view = 'week', date } = await searchParams
  const supabase = await createClient()

  const referenceDate = date ? new Date(date) : new Date()

  // 表示週の月〜土の日付を計算（シフト取得用）
  const pad0 = (n: number) => String(n).padStart(2, '0')
  const toLD = (d: Date) => `${d.getFullYear()}-${pad0(d.getMonth() + 1)}-${pad0(d.getDate())}`
  const mondayRef = new Date(referenceDate)
  const dow0 = mondayRef.getDay()
  mondayRef.setDate(mondayRef.getDate() + (dow0 === 0 ? -6 : 1 - dow0))
  const weekDates = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mondayRef); d.setDate(mondayRef.getDate() + i); return toLD(d)
  })

  const [{ data: lessons }, { data: termPeriods }, { data: closures }, { data: slotSetting }, { data: teachers }, { data: students }, { data: shifts }, { data: makeupAssignments }] = await Promise.all([
    supabase
      .from('lessons')
      .select('*, teacher:teachers(id, name), booth:booths(id, name), enrollments:lesson_enrollments(id, student_id, student:students(id, name))')
      .order('slot_index'),
    supabase.from('term_periods').select('*').order('start_date'),
    supabase.from('school_closures').select('date'),
    supabase.from('app_settings').select('value').eq('key', 'time_slots').single(),
    supabase.from('teachers').select('id, name').order('name'),
    supabase.from('students').select('id, name, grade').order('name'),
    supabase.from('shifts').select('id, teacher_id, date, start_time, end_time').in('date', weekDates),
    supabase.from('makeup_assignments').select('id, lesson_id, assigned_date, student:students(id, name)').eq('assigned_date', toLD(referenceDate)),
  ])

  const closureDates = (closures ?? []).map((c: { date: string }) => c.date)
  const customSlots = (slotSetting?.value as TimeSlotConfig) ?? null

  // Determine current term type for the reference date
  const pad = (n: number) => String(n).padStart(2, '0')
  const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const dateStr = toLocalDate(referenceDate)
  const activeTerm = (termPeriods as TermPeriod[] ?? []).find(
    (t) => t.start_date <= dateStr && t.end_date >= dateStr
  )
  const currentTermType = activeTerm?.type ?? 'regular'

  return (
    <div>
      <Header
        title="スケジュール管理"
        subtitle="週次カレンダー"
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/schedule/print/week?date=${dateStr}`}>
              <Button size="md" variant="ghost">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                週間印刷
              </Button>
            </Link>
            <Link href={`/schedule/print/day?date=${dateStr}`}>
              <Button size="md" variant="ghost">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                日次印刷
              </Button>
            </Link>
            <a
              href="/api/export/lessons"
              download
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              CSVエクスポート
            </a>
            <Link href="/schedule/new">
              <Button size="md">+ コマを追加</Button>
            </Link>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          {(['week', 'month', 'day'] as const).map((v) => (
            <Link
              key={v}
              href={`/schedule?view=${v}&date=${dateStr}`}
              className={[
                'px-4 py-2 text-sm font-medium transition-colors',
                view === v
                  ? 'bg-[#1E3A5F] text-white'
                  : 'text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {v === 'week' ? '週' : v === 'month' ? '月' : '日'}
            </Link>
          ))}
        </div>

        <Badge variant={currentTermType === 'intensive' ? 'intensive' : 'regular'}>
          {activeTerm ? activeTerm.name : '通常期間'}
        </Badge>

        <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-purple-400" />
            集団授業
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-teal-400" />
            個別指導
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        {view === 'week' && (
          <ScheduleFilter
            lessons={(lessons as Lesson[]) ?? []}
            teachers={(teachers as Teacher[]) ?? []}
            students={(students as Student[]) ?? []}
            termPeriods={(termPeriods as TermPeriod[]) ?? []}
            referenceDate={referenceDate}
            closureDates={closureDates}
            customSlots={customSlots}
            shifts={(shifts as { id: string; teacher_id: string; date: string; start_time: string; end_time: string }[]) ?? []}
          />
        )}
        {view === 'month' && (
          <MonthlyViewPlaceholder date={referenceDate} />
        )}
        {view === 'day' && (
          <DailyViewPlaceholder date={referenceDate} lessons={(lessons as Lesson[]) ?? []} makeupAssignments={(makeupAssignments ?? []) as { id: string; lesson_id: string; assigned_date: string; student: { id: string; name: string } | null }[]} />
        )}
      </div>
    </div>
  )
}

function MonthlyViewPlaceholder({ date }: { date: Date }) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const year = date.getFullYear()
  const month = date.getMonth()
  const monthStr = `${year}年${month + 1}月`

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay() === 0 ? 7 : firstDay.getDay()
  const totalDays = lastDay.getDate()
  const cells: (number | null)[] = [
    ...Array(startDow - 1).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  // Pad to complete weeks
  while (cells.length % 7 !== 0) cells.push(null)

  const dayHeaders = ['月', '火', '水', '木', '金', '土', '日']
  const today = new Date()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/schedule?view=month&date=${toLocalDate(new Date(year, month - 1, 1))}`}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          ‹ 前月
        </Link>
        <h2 className="text-lg font-semibold text-gray-900">{monthStr}</h2>
        <Link
          href={`/schedule?view=month&date=${toLocalDate(new Date(year, month + 1, 1))}`}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          次月 ›
        </Link>
      </div>
      <div className="grid grid-cols-7">
        {dayHeaders.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-500 border-b border-gray-100">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const isToday =
            day !== null &&
            today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === day
          return (
            <div
              key={i}
              className={[
                'min-h-[80px] p-1.5 border-b border-r border-gray-100',
                day === null ? 'bg-gray-50' : 'hover:bg-gray-50 cursor-pointer',
                i % 7 === 0 ? 'border-l' : '',
              ].join(' ')}
            >
              {day !== null && (
                <Link
                  href={`/schedule?view=day&date=${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
                  className="block w-full h-full"
                >
                  <span
                    className={[
                      'inline-flex items-center justify-center w-7 h-7 rounded-full text-sm',
                      isToday ? 'bg-[#1E3A5F] text-white font-bold' : 'text-gray-700',
                    ].join(' ')}
                  >
                    {day}
                  </span>
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DailyViewPlaceholder({ date, lessons, makeupAssignments }: { date: Date; lessons: Lesson[]; makeupAssignments: { id: string; lesson_id: string; assigned_date: string; student: { id: string; name: string } | null }[] }) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const dayOfWeek = date.getDay()
  const dayLessons = lessons.filter((l) => l.day_of_week === dayOfWeek)
  const dateStr = date.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/schedule?view=day&date=${toLocalDate(new Date(date.getTime() - 86400000))}`}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          ‹ 前日
        </Link>
        <h2 className="text-lg font-semibold text-gray-900">{dateStr}</h2>
        <Link
          href={`/schedule?view=day&date=${toLocalDate(new Date(date.getTime() + 86400000))}`}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          翌日 ›
        </Link>
      </div>
      {dayLessons.length === 0 ? (
        <p className="text-center text-gray-400 py-10 text-sm">この日のコマはありません</p>
      ) : (
        <div className="space-y-2">
          {dayLessons.sort((a, b) => a.slot_index - b.slot_index).map((lesson) => {
            const isGroup = lesson.type === 'group'
            const regularStudents = lesson.enrollments?.map((e) => e.student).filter((s): s is NonNullable<typeof s> => s != null) ?? []
            const makeupStudents = makeupAssignments.filter(m => m.lesson_id === lesson.id && m.student).map(m => m.student!)
            const teacher = lesson.teacher as { name: string } | null | undefined
            const totalCount = regularStudents.length + makeupStudents.length
            return (
              <Link
                key={lesson.id}
                href={`/schedule/${lesson.id}`}
                className={[
                  'flex items-start gap-4 rounded-xl p-3 border transition-opacity hover:opacity-80',
                  isGroup ? 'bg-purple-50 border-purple-200' : 'bg-teal-50 border-teal-200',
                ].join(' ')}
              >
                <div className="text-center shrink-0 min-w-[48px]">
                  <p className="text-xs font-bold text-gray-600">第{lesson.slot_index}コマ</p>
                  <p className="text-[10px] text-gray-400">{lesson.subject}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {teacher?.name && (
                      <span className={[
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        isGroup ? 'bg-purple-700 text-white' : 'bg-teal-700 text-white',
                      ].join(' ')}>
                        {teacher.name}
                      </span>
                    )}
                    {regularStudents.map((s) => (
                      <span key={s.id} className="text-sm text-gray-700">{s.name}</span>
                    ))}
                    {makeupStudents.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                        {s.name}
                        <span className="text-[10px] font-bold text-amber-600">振替</span>
                      </span>
                    ))}
                    {totalCount === 0 && (
                      <span className="text-xs text-gray-400">生徒未登録</span>
                    )}
                  </div>
                  {lesson.booth && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{(lesson as { booth?: { name: string } }).booth?.name}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {totalCount}/{lesson.capacity}名
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
