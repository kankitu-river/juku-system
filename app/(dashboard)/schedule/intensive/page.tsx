import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { IntensivePlanner } from './IntensivePlanner'
import Link from 'next/link'
import type { TermPeriod } from '@/types'

interface PageProps {
  searchParams: Promise<{ term?: string }>
}

export default async function IntensivePage({ searchParams }: PageProps) {
  const { term } = await searchParams
  const supabase = await createClient()

  const [{ data: termPeriods }, { data: students }] = await Promise.all([
    supabase.from('term_periods').select('*').eq('type', 'intensive').order('start_date', { ascending: false }),
    supabase.from('students').select('id, name, grade').order('grade').order('name'),
  ])

  const intensivePeriods = (termPeriods as TermPeriod[]) ?? []
  const selectedTermId = term ?? intensivePeriods[0]?.id ?? ''
  const selectedTerm = intensivePeriods.find((t) => t.id === selectedTermId)

  const [{ data: lessons }, { data: plans }] = await Promise.all([
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
  ])

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

      {selectedTerm && (
        <IntensivePlanner
          students={(students ?? []) as any}
          lessons={(lessons ?? []) as any}
          plans={(plans ?? []) as any}
          termPeriodId={selectedTermId}
          termPeriodName={selectedTerm.name}
        />
      )}
    </div>
  )
}
