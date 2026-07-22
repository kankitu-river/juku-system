import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { IntensivePlanner, type IntensivePlannerStudent, type IntensivePlannerLesson, type IntensivePlannerPlan } from './IntensivePlanner'
import { IntensiveBulkCreator } from './IntensiveBulkCreator'
import Link from 'next/link'
import type { TermPeriod } from '@/types'
import type { IntensiveSlotLimits } from '@/lib/constants/timeSlots'

interface PageProps {
  searchParams: Promise<{ term?: string }>
}

export default async function IntensivePage({ searchParams }: PageProps) {
  const { term } = await searchParams
  const supabase = await createClient()

  const [{ data: termPeriods }, { data: students }, { data: teachers }, { data: booths }, { data: slotLimitSetting }, { data: closures }] = await Promise.all([
    supabase.from('term_periods').select('*').eq('type', 'intensive').order('start_date', { ascending: false }),
    supabase.from('students').select('id, name, grade, subjects, parent_requests, is_trial').order('grade').order('name'),
    supabase.from('teachers').select('id, name').order('name'),
    supabase.from('booths').select('id, name').eq('is_active', true).order('name'),
    supabase.from('app_settings').select('value').eq('key', 'intensive_slot_limits').single(),
    supabase.from('school_closures').select('date'),
  ])
  const intensiveSlotLimits = (slotLimitSetting?.value as IntensiveSlotLimits) ?? null
  const closureDates = (closures ?? []).map((c: { date: string }) => c.date)

  const intensivePeriods = (termPeriods as TermPeriod[]) ?? []
  const selectedTermId = term ?? intensivePeriods[0]?.id ?? ''
  const selectedTerm = intensivePeriods.find((t) => t.id === selectedTermId)

  const [{ data: lessons }, { data: plans }, { data: allIntensiveLessons }] = await Promise.all([
    selectedTermId
      ? supabase
          .from('lessons')
          .select('*, teacher:teachers(id, name), enrollments:lesson_enrollments(student_id)')
          .eq('term_type', 'intensive')
          .order('day_of_week')
          .order('slot_index')
      : Promise.resolve({ data: [] }),
    selectedTermId
      ? supabase
          .from('intensive_plans')
          .select('*')
          .eq('term_period_id', selectedTermId)
      : Promise.resolve({ data: [] }),
    selectedTermId
      ? supabase.from('lessons').select('id, capacity, lesson_enrollments(id)').eq('term_type', 'intensive')
      : Promise.resolve({ data: [] }),
  ])

  // 需給サマリー
  const demand = (plans ?? []).reduce((s, p) => s + ((p as { planned_lessons: number }).planned_lessons ?? 0), 0)
  const supply = (allIntensiveLessons ?? []).reduce((s, l) => s + ((l as { capacity: number }).capacity ?? 0), 0)
  const enrolled = (allIntensiveLessons ?? []).reduce(
    (s, l) => s + ((l as { lesson_enrollments: { id: string }[] }).lesson_enrollments?.length ?? 0), 0
  )
  const supplyGap = supply - demand

  return (
    <div>
      <Header
        title="講習コマ割り振り"
        subtitle="生徒ごとに受講コマ数を設定し、具体的な日程に割り振ります"
        actions={
          <Link href="/schedule/new?term_type=intensive" className="inline-flex items-center gap-1.5 px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-dark transition-colors">
            + 講習コマを追加
          </Link>
        }
      />

      {/* タブナビゲーション */}
      <div className="flex gap-2 mb-5 border-b border-gray-200 dark:border-gray-700">
        <span className="px-5 py-2.5 text-sm font-medium text-navy dark:text-blue-300 border-b-2 border-navy">
          コマ割り振り
        </span>
        <Link
          href={selectedTermId ? `/schedule/intensive/availability?term=${selectedTermId}` : '/schedule/intensive/availability'}
          className="px-5 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 border-b-2 border-transparent transition-colors"
        >
          来塾希望入力
        </Link>
        <Link
          href={selectedTermId ? `/schedule/intensive/auto?term=${selectedTermId}` : '/schedule/intensive/auto'}
          className="px-5 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 border-b-2 border-transparent transition-colors"
        >
          自動割り振り
        </Link>
      </div>

      {/* 期間選択 */}
      {intensivePeriods.length === 0 ? (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-5 mb-5">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">講習期間が未設定です</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
            先に「設定」→「期間区分」で講習期間（夏期講習など）を登録してください。
          </p>
          <Link href="/settings" className="text-sm text-amber-700 dark:text-amber-300 underline">設定ページへ →</Link>
        </div>
      ) : (
        <div className="mb-5 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">期間：</span>
          {intensivePeriods.map((t) => (
            <Link
              key={t.id}
              href={`/schedule/intensive?term=${t.id}`}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                t.id === selectedTermId
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-navy',
              ].join(' ')}
            >
              {t.name}
              <span className="ml-1.5 text-xs opacity-70">
                {t.start_date.slice(5).replace('-', '/')}〜{t.end_date.slice(5).replace('-', '/')}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* 需給サマリー */}
      {selectedTerm && (demand > 0 || supply > 0) && (
        <div className={[
          'mb-5 rounded-xl border p-4',
          supplyGap < 0
            ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
            : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900',
        ].join(' ')}>
          <h3 className={[
            'text-sm font-semibold mb-3',
            supplyGap < 0 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300',
          ].join(' ')}>
            需給サマリー — {selectedTerm.name}
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: '需要（生徒の希望コマ数合計）', value: demand, unit: 'コマ', color: 'text-gray-700 dark:text-gray-200' },
              { label: '供給（全コマの定員合計）', value: supply, unit: 'コマ', color: 'text-gray-700 dark:text-gray-200' },
              {
                label: supplyGap >= 0 ? '余裕（供給 − 需要）' : '不足（需要 − 供給）',
                value: Math.abs(supplyGap),
                unit: 'コマ',
                color: supplyGap < 0 ? 'text-red-600 dark:text-red-400 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-bold',
              },
            ].map(({ label, value, unit, color }) => (
              <div key={label} className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}<span className="text-sm font-normal text-gray-400 ml-1">{unit}</span></p>
              </div>
            ))}
          </div>
          {supplyGap < 0 && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              ⚠ コマの定員が生徒の希望に対して{Math.abs(supplyGap)}コマ不足しています。コマを追加するか定員を増やしてください。
            </p>
          )}
          <p className="mt-2 text-xs text-gray-400">現在の受講登録数: {enrolled}件</p>
        </div>
      )}

      {selectedTerm && (
        <IntensiveBulkCreator
          termPeriodName={selectedTerm.name}
          startDate={selectedTerm.start_date}
          endDate={selectedTerm.end_date}
          teachers={(teachers ?? []) as { id: string; name: string }[]}
          booths={(booths ?? []) as { id: string; name: string }[]}
          intensiveSlotLimits={intensiveSlotLimits}
          closureDates={closureDates}
        />
      )}

      {selectedTerm && (
        <IntensivePlanner
          students={(students as unknown as IntensivePlannerStudent[]) ?? []}
          lessons={(lessons as unknown as IntensivePlannerLesson[]) ?? []}
          plans={(plans as unknown as IntensivePlannerPlan[]) ?? []}
          termPeriodId={selectedTermId}
          termPeriodName={selectedTerm.name}
        />
      )}
    </div>
  )
}
