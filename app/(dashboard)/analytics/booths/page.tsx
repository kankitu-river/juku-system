import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { DAYS_OF_WEEK, REGULAR_SLOTS, INTENSIVE_SLOTS } from '@/lib/constants/timeSlots'
import { getJstTodayStr } from '@/lib/utils/datetime'

interface PageProps {
  searchParams: Promise<{ term?: string }>
}

function boothColor(pct: number): string {
  if (pct === 0) return 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600'
  if (pct < 50)  return 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
  if (pct < 80)  return 'bg-yellow-200 dark:bg-yellow-800/60 text-yellow-800 dark:text-yellow-200'
  if (pct < 90)  return 'bg-orange-300 dark:bg-orange-800/60 text-orange-800 dark:text-orange-100'
  return 'bg-red-400 dark:bg-red-800 text-white'
}

export default async function BoothsAnalyticsPage({ searchParams }: PageProps) {
  const { term } = await searchParams
  const supabase = await createClient()
  const todayStr = getJstTodayStr()

  const { data: termPeriods } = await supabase
    .from('term_periods')
    .select('type')
    .lte('start_date', todayStr)
    .gte('end_date', todayStr)

  const currentTermType = (termPeriods?.[0]?.type as 'regular' | 'intensive') ?? 'regular'
  const termType = (term as 'regular' | 'intensive') ?? currentTermType

  const [{ data: booths }, { data: lessons }] = await Promise.all([
    supabase.from('booths').select('id').eq('is_active', true),
    supabase
      .from('lessons')
      .select('day_of_week, slot_index, booth_id')
      .eq('term_type', termType)
      .not('booth_id', 'is', null),
  ])

  const totalBooths = booths?.length ?? 0

  // (day_of_week, slot_index) -> distinct booth IDs used
  const boothsUsedMap = new Map<string, Set<string>>()
  for (const l of lessons ?? []) {
    const key = `${l.day_of_week}-${l.slot_index}`
    if (!boothsUsedMap.has(key)) boothsUsedMap.set(key, new Set())
    boothsUsedMap.get(key)!.add(l.booth_id as string)
  }

  const slots = termType === 'intensive' ? INTENSIVE_SLOTS : REGULAR_SLOTS

  return (
    <div>
      <Header
        title="ブース稼働率"
        subtitle={`全${totalBooths}ブース · 曜日×スロット別稼働率`}
      />

      {/* 期間区分切り替え */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm text-gray-500 dark:text-gray-400">期間区分:</span>
        {(['regular', 'intensive'] as const).map((t) => (
          <a
            key={t}
            href={`/analytics/booths?term=${t}`}
            className={[
              'px-3 py-1 text-sm rounded-full border transition-colors',
              termType === t
                ? 'bg-navy text-white border-navy dark:bg-blue-700 dark:border-blue-700'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-navy dark:hover:border-blue-400',
            ].join(' ')}
          >
            {t === 'regular' ? '通常期間' : '講習期間'}
          </a>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-28 px-3 py-2 text-left text-xs text-gray-400 font-normal border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  スロット
                </th>
                {DAYS_OF_WEEK.map((d) => (
                  <th
                    key={d.value}
                    className="w-24 px-3 py-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
                  >
                    {d.label}曜
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.index}>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 whitespace-nowrap">
                    第{slot.index}コマ<br />
                    <span className="text-[10px] text-gray-400">{slot.start}〜{slot.end}</span>
                  </td>
                  {DAYS_OF_WEEK.map((d) => {
                    const used = boothsUsedMap.get(`${d.value}-${slot.index}`)?.size ?? 0
                    const pct = totalBooths > 0 ? Math.round((used / totalBooths) * 100) : 0
                    return (
                      <td
                        key={d.value}
                        className={[
                          'px-3 py-3 text-center border border-gray-100 dark:border-gray-700 transition-colors',
                          boothColor(pct),
                        ].join(' ')}
                      >
                        {used > 0 ? (
                          <>
                            <span className="font-bold text-base">{pct}%</span>
                            <div className="text-[10px] opacity-75">{used}/{totalBooths}</div>
                            {pct >= 90 && (
                              <div className="text-[10px] font-bold mt-0.5">満席間近</div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 凡例 */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          {[
            { cls: 'bg-emerald-100 dark:bg-emerald-950/60', label: '〜50%' },
            { cls: 'bg-yellow-200 dark:bg-yellow-800/60', label: '50〜80%' },
            { cls: 'bg-orange-300 dark:bg-orange-800/60', label: '80〜90%' },
            { cls: 'bg-red-400 dark:bg-red-800', label: '90%以上（満席間近）' },
          ].map(({ cls, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className={`w-5 h-4 rounded ${cls} inline-block`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
        ※ ブースが割り当てられているコマのみ集計。同一スロットに複数ブースを使う場合はそれぞれカウント。
      </p>
    </div>
  )
}
