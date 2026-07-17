import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { getJstTodayStr } from '@/lib/utils/datetime'

interface PageProps {
  searchParams: Promise<{ month?: string }>
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m)}月`
}

export default async function MonthlyReportPage({ searchParams }: PageProps) {
  const { month } = await searchParams
  const supabase = await createClient()
  const today = getJstTodayStr()
  const [cy, cm] = today.split('-')
  const targetMonth = month ?? `${cy}-${cm}`
  const [ty, tm] = targetMonth.split('-')
  const monthStart = `${ty}-${tm}-01`
  const nextMonth = parseInt(tm) === 12 ? `${parseInt(ty) + 1}-01` : `${ty}-${String(parseInt(tm) + 1).padStart(2, '0')}`
  const monthEnd = `${nextMonth}-01`

  // 前月
  const prevTm = parseInt(tm) === 1 ? 12 : parseInt(tm) - 1
  const prevTy = parseInt(tm) === 1 ? parseInt(ty) - 1 : parseInt(ty)
  const prevMonth = `${prevTy}-${String(prevTm).padStart(2, '0')}`

  const [
    { data: lessons },
    { data: attendances },
    { data: makeupAssignments },
    { data: teachers },
  ] = await Promise.all([
    // 当月にある全コマ（通常: always exist / 臨時: specific_date in month）
    supabase.from('lessons').select('id, teacher_id, type, lesson_kind, specific_date, teacher:teachers(id, name)'),
    // 当月の出欠記録
    supabase
      .from('attendances')
      .select('student_id, lesson_id, date, status, makeup_credited')
      .gte('date', monthStart)
      .lt('date', monthEnd),
    // 当月の振替消化記録
    supabase
      .from('makeup_assignments')
      .select('id, student_id, assigned_date')
      .gte('assigned_date', monthStart)
      .lt('assigned_date', monthEnd),
    supabase.from('teachers').select('id, name').order('name'),
  ])

  // 当月の出欠から集計
  const totalAttendances = (attendances ?? []).length
  const presentCount = (attendances ?? []).filter((a) => a.status === 'present').length
  const absentCount = (attendances ?? []).filter((a) => a.status === 'absent').length
  const makeupCreditedCount = (attendances ?? []).filter((a) => a.makeup_credited).length
  const makeupUsedCount = (makeupAssignments ?? []).length
  const attendanceRate = totalAttendances > 0 ? Math.round((presentCount / totalAttendances) * 100) : 0
  const makeupConsumeRate = makeupCreditedCount > 0 ? Math.round((makeupUsedCount / makeupCreditedCount) * 100) : 0

  // 講師別担当コマ数（当月の出欠がある授業で集計）
  const teacherLessonMap = new Map<string, { name: string; count: number }>()
  const teacherNameMap = new Map((teachers ?? []).map((t) => [t.id as string, t.name as string]))

  for (const a of attendances ?? []) {
    const lesson = (lessons ?? []).find((l) => l.id === a.lesson_id)
    if (!lesson?.teacher_id) continue
    const tid = lesson.teacher_id as string
    const name = teacherNameMap.get(tid) ?? '—'
    const existing = teacherLessonMap.get(tid)
    if (existing) existing.count++
    else teacherLessonMap.set(tid, { name, count: 1 })
  }
  const teacherRanking = Array.from(teacherLessonMap.values()).sort((a, b) => b.count - a.count)

  // 月ナビゲーション用
  const prevM = `?month=${prevMonth}`
  const nextM = targetMonth < `${cy}-${cm}` ? `?month=${nextMonth.slice(0, 7)}` : null

  return (
    <div>
      <Header title="月次レポート" subtitle={monthLabel(targetMonth)} />

      {/* 月ナビゲーション */}
      <div className="flex items-center gap-4 mb-6">
        <a href={prevM} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-300">
          ‹ {monthLabel(prevMonth)}
        </a>
        <span className="font-semibold text-gray-700 dark:text-gray-300">{monthLabel(targetMonth)}</span>
        {nextM && (
          <a href={nextM} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-300">
            {monthLabel(nextMonth.slice(0, 7))} ›
          </a>
        )}
        <button
          onClick={undefined}
          className="ml-auto px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-300 print:hidden"
          // printは <a href="javascript:print()"> or window.print() — use client comp for this
        >
          印刷
        </button>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 print-grid">
        {[
          { label: '出欠記録件数', value: totalAttendances, unit: '件' },
          { label: '出席率', value: `${attendanceRate}%`, unit: '' },
          { label: '欠席件数', value: absentCount, unit: '件' },
          { label: '振替消化率', value: `${makeupConsumeRate}%`, unit: '' },
        ].map(({ label, value, unit }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            <p className="text-2xl font-bold text-navy dark:text-blue-300">
              {value}
              {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 出欠内訳 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">出欠内訳</h3>
          <div className="space-y-3">
            {[
              { label: '出席', count: presentCount, color: 'bg-green-400' },
              { label: '欠席', count: absentCount, color: 'bg-red-400' },
              { label: '振替クレジット付与', count: makeupCreditedCount, color: 'bg-amber-400' },
              { label: '振替消化', count: makeupUsedCount, color: 'bg-blue-400' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${color}`} />
                <span className="text-sm text-gray-600 dark:text-gray-300 flex-1">{label}</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{count}件</span>
              </div>
            ))}
          </div>

          {/* 簡易バー */}
          {totalAttendances > 0 && (
            <div className="mt-4 h-3 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden flex">
              <div className="bg-green-400 h-full" style={{ width: `${(presentCount / totalAttendances) * 100}%` }} />
              <div className="bg-red-400 h-full" style={{ width: `${(absentCount / totalAttendances) * 100}%` }} />
            </div>
          )}
        </div>

        {/* 講師別担当数 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">講師別授業担当数（出欠ベース）</h3>
          {teacherRanking.length === 0 ? (
            <p className="text-sm text-gray-400">データがありません</p>
          ) : (
            <div className="space-y-2">
              {teacherRanking.map((t, i) => (
                <div key={t.name} className="flex items-center gap-3">
                  <span className="w-5 text-xs text-gray-400 text-right">{i + 1}</span>
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{t.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-navy dark:bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(100, (t.count / (teacherRanking[0]?.count ?? 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 w-10 text-right">{t.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
