import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { DAYS_OF_WEEK, REGULAR_SLOTS, INTENSIVE_SLOTS } from '@/lib/constants/timeSlots'
import { getJstTodayStr } from '@/lib/utils/datetime'

interface PageProps {
  searchParams: Promise<{ term?: string }>
}

function heatColor(count: number, max: number): string {
  if (count === 0) return 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600'
  const r = max > 0 ? count / max : 0
  if (r < 0.25) return 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
  if (r < 0.5)  return 'bg-blue-300 dark:bg-blue-800/70 text-blue-900 dark:text-blue-100'
  if (r < 0.75) return 'bg-amber-300 dark:bg-amber-700/70 text-amber-900 dark:text-amber-100'
  if (r < 0.9)  return 'bg-orange-400 dark:bg-orange-700 text-white'
  return 'bg-red-500 dark:bg-red-700 text-white'
}

export default async function HeatmapPage({ searchParams }: PageProps) {
  const { term } = await searchParams
  const supabase = await createClient()
  const todayStr = getJstTodayStr()

  // 現在の期間区分を取得
  const { data: termPeriods } = await supabase
    .from('term_periods')
    .select('type, start_date, end_date')
    .lte('start_date', todayStr)
    .gte('end_date', todayStr)

  const currentTermType = (termPeriods?.[0]?.type as 'regular' | 'intensive') ?? 'regular'
  const termType = (term as 'regular' | 'intensive') ?? currentTermType

  const { data: lessons } = await supabase
    .from('lessons')
    .select('day_of_week, slot_index, type, lesson_kind')
    .eq('term_type', termType)

  // (day_of_week, slot_index) -> コマ数
  const countMap = new Map<string, number>()
  for (const l of lessons ?? []) {
    const key = `${l.day_of_week}-${l.slot_index}`
    countMap.set(key, (countMap.get(key) ?? 0) + 1)
  }

  const slots = termType === 'intensive' ? INTENSIVE_SLOTS : REGULAR_SLOTS
  const maxCount = Math.max(0, ...Array.from(countMap.values()))

  return (
    <div>
      <Header title="混雑ヒートマップ" subtitle="曜日×スロット別コマ数" />

      {/* 期間区分切り替え */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm text-gray-500 dark:text-gray-400">期間区分:</span>
        {(['regular', 'intensive'] as const).map((t) => (
          <a
            key={t}
            href={`/analytics/heatmap?term=${t}`}
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
                    className="w-20 px-3 py-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
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
                    const count = countMap.get(`${d.value}-${slot.index}`) ?? 0
                    return (
                      <td
                        key={d.value}
                        className={[
                          'px-3 py-3 text-center border border-gray-100 dark:border-gray-700 transition-colors',
                          heatColor(count, maxCount),
                        ].join(' ')}
                      >
                        {count > 0 ? (
                          <span className="font-bold text-base">{count}</span>
                        ) : (
                          <span className="text-xs">—</span>
                        )}
                        {count > 0 && <div className="text-[10px] opacity-75">コマ</div>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 凡例 */}
        <div className="mt-4 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>少ない</span>
          {[
            'bg-blue-100 dark:bg-blue-950/60',
            'bg-blue-300 dark:bg-blue-800/70',
            'bg-amber-300 dark:bg-amber-700/70',
            'bg-orange-400 dark:bg-orange-700',
            'bg-red-500 dark:bg-red-700',
          ].map((cls, i) => (
            <span key={i} className={`w-6 h-4 rounded ${cls} inline-block`} />
          ))}
          <span>多い</span>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
        ※ 通常コマと臨時コマを含む。色は最大コマ数を基準に相対表示。
      </p>
    </div>
  )
}
