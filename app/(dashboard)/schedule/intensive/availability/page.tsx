import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { AvailabilityEditor } from './AvailabilityEditor'
import type { TermPeriod } from '@/types'
import type { IntensiveSlotLimits } from '@/lib/constants/timeSlots'

interface PageProps {
  searchParams: Promise<{ term?: string }>
}

function generateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const cur = new Date(startDate)
  const end = new Date(endDate)
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export default async function IntensiveAvailabilityPage({ searchParams }: PageProps) {
  const { term } = await searchParams
  const supabase = await createClient()

  const [{ data: termPeriods }, { data: students }, { data: slotLimitSetting }] = await Promise.all([
    supabase.from('term_periods').select('*').eq('type', 'intensive').order('start_date', { ascending: false }),
    supabase.from('students').select('id, name, grade').order('grade').order('name'),
    supabase.from('app_settings').select('value').eq('key', 'intensive_slot_limits').single(),
  ])
  const slotLimits = (slotLimitSetting?.value as IntensiveSlotLimits) ?? null

  const intensivePeriods = (termPeriods as TermPeriod[]) ?? []
  const selectedTermId = term ?? intensivePeriods[0]?.id ?? ''
  const selectedTerm = intensivePeriods.find((t) => t.id === selectedTermId)

  const dates = selectedTerm ? generateDates(selectedTerm.start_date, selectedTerm.end_date) : []

  const [{ data: availabilityRows }, { data: notesRows }] = await Promise.all([
    selectedTermId
      ? supabase
          .from('intensive_student_availability')
          .select('student_id, date, slot_index')
          .eq('term_period_id', selectedTermId)
      : Promise.resolve({ data: [] }),
    selectedTermId
      ? supabase
          .from('intensive_student_notes')
          .select('student_id, notes')
          .eq('term_period_id', selectedTermId)
      : Promise.resolve({ data: [] }),
  ])

  // Build lookup maps
  const initialAvailability: Record<string, string[]> = {}
  for (const row of (availabilityRows ?? []) as { student_id: string; date: string; slot_index: number }[]) {
    if (!initialAvailability[row.student_id]) initialAvailability[row.student_id] = []
    initialAvailability[row.student_id].push(`${row.date}__${row.slot_index}`)
  }

  const initialNotes: Record<string, string> = {}
  for (const row of (notesRows ?? []) as { student_id: string; notes: string }[]) {
    initialNotes[row.student_id] = row.notes
  }

  return (
    <div>
      <Header
        title="来塾希望入力"
        subtitle="講習期間中、生徒ごとに来られるコマを登録します"
        actions={
          <Link href="/schedule/new" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1E3A5F] text-white text-sm font-medium rounded-lg hover:bg-[#162d4a] transition-colors">
            + 講習コマを追加
          </Link>
        }
      />

      {/* タブナビゲーション */}
      <div className="flex gap-2 mb-5 border-b border-gray-200">
        <Link
          href={selectedTermId ? `/schedule/intensive?term=${selectedTermId}` : '/schedule/intensive'}
          className="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent transition-colors"
        >
          コマ割り振り
        </Link>
        <span className="px-5 py-2.5 text-sm font-medium text-[#1E3A5F] border-b-2 border-[#1E3A5F]">
          来塾希望入力
        </span>
        <Link
          href={selectedTermId ? `/schedule/intensive/auto?term=${selectedTermId}` : '/schedule/intensive/auto'}
          className="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent transition-colors"
        >
          自動割り振り
        </Link>
      </div>

      {intensivePeriods.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-amber-800 mb-1">講習期間が未設定です</p>
          <p className="text-xs text-amber-700 mb-3">
            先に「設定」→「期間区分」で講習期間（夏期講習など）を登録してください。
          </p>
          <Link href="/settings" className="text-sm text-amber-700 underline">設定ページへ →</Link>
        </div>
      ) : (
        <>
          {/* 期間選択 */}
          <div className="mb-5 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-600 font-medium">期間：</span>
            {intensivePeriods.map((t) => (
              <Link
                key={t.id}
                href={`/schedule/intensive/availability?term=${t.id}`}
                className={[
                  'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                  t.id === selectedTermId
                    ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-[#1E3A5F]',
                ].join(' ')}
              >
                {t.name}
                <span className="ml-1.5 text-xs opacity-70">
                  {t.start_date.slice(5).replace('-', '/')}〜{t.end_date.slice(5).replace('-', '/')}
                </span>
              </Link>
            ))}
          </div>

          {selectedTerm ? (
            <AvailabilityEditor
              students={(students ?? []) as { id: string; name: string; grade: string }[]}
              termPeriodId={selectedTermId}
              termPeriodName={selectedTerm.name}
              dates={dates}
              initialAvailability={initialAvailability}
              initialNotes={initialNotes}
              slotLimits={slotLimits}
            />
          ) : (
            <p className="text-sm text-gray-500">期間を選択してください</p>
          )}
        </>
      )}
    </div>
  )
}
