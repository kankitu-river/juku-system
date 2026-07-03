import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { TermPeriodManager } from './TermPeriodManager'
import { ClosureCalendar } from './ClosureCalendar'
import { TimeSlotEditor } from './TimeSlotEditor'
import { IntensiveSlotSettings } from './IntensiveSlotSettings'
import { GradeAdvancement } from '@/components/settings/GradeAdvancement'
import { UserManager } from './UserManager'
import { listUsers } from './userActions'
import type { TermPeriod } from '@/types'
import type { TimeSlotConfig } from './actions'
import type { IntensiveSlotLimits } from '@/lib/constants/timeSlots'

export default async function SettingsPage() {
  const supabase = await createClient()

  const [
    { data: termPeriods },
    { data: closures },
    { data: slotSetting },
    { data: intensiveSlotSetting },
    { data: { user: currentUser } },
    { users },
  ] = await Promise.all([
    supabase.from('term_periods').select('*').order('start_date', { ascending: false }),
    supabase.from('school_closures').select('date').order('date'),
    supabase.from('app_settings').select('value').eq('key', 'time_slots').single(),
    supabase.from('app_settings').select('value').eq('key', 'intensive_slot_limits').single(),
    supabase.auth.getUser(),
    listUsers(),
  ])

  const closureDates = (closures ?? []).map((c: { date: string }) => c.date)
  const customSlots = (slotSetting?.value as TimeSlotConfig) ?? null
  const intensiveSlotLimits = (intensiveSlotSetting?.value as IntensiveSlotLimits) ?? {}

  return (
    <div>
      <Header title="設定" subtitle="休校日・時間帯・期間区分の管理" />

      <div className="max-w-2xl space-y-6">
        {/* アカウント管理 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">アカウント管理</h2>
          <p className="text-sm text-gray-500 mb-4">
            ログインできるアカウントの追加・削除・権限変更ができます。
          </p>
          <UserManager
            users={users ?? []}
            currentUserId={currentUser?.id ?? ''}
          />
        </div>
        {/* 休校日設定 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">休校日の設定</h2>
          <p className="text-sm text-gray-500 mb-4">
            カレンダーで休校にする日をタップすると赤くなって休校日として登録されます。スケジュール画面にも反映されます。
          </p>
          <ClosureCalendar initialClosureDates={closureDates} />
        </div>

        {/* 授業時間設定 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">授業時間の変更</h2>
          <p className="text-sm text-gray-500 mb-4">
            時間帯スロットの開始・終了時刻を変更できます。変更後はコマ作成画面とカレンダーに反映されます。
          </p>
          <TimeSlotEditor initialConfig={customSlots} />
        </div>

        {/* 講習期間コマ上限 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">講習期間のコマ数設定</h2>
          <p className="text-sm text-gray-500 mb-4">
            曜日ごとに講習期間で使用する最終コマを設定します。それ以降のコマは来塾希望入力・コマ作成から非表示になります。
          </p>
          <IntensiveSlotSettings initialLimits={intensiveSlotLimits} />
        </div>

        {/* 期間区分 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">期間区分の管理</h2>
          <p className="text-sm text-gray-500 mb-4">
            通常期間・講習期間（夏・冬・春）を登録します。登録した期間に基づいて時間帯スロットが自動で切り替わります。
          </p>
          <TermPeriodManager initialPeriods={(termPeriods as TermPeriod[]) ?? []} />
        </div>

        {/* 一括進級処理 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">一括進級処理</h2>
          <GradeAdvancement />
        </div>

        {/* 重複コマの統合 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">重複コマの統合</h2>
          <p className="text-sm text-gray-500 mb-4">
            同じ先生・同じ時間帯に複数のコマが登録されている場合、1つにまとめます。生徒の科目情報は保持されます。
          </p>
          <Link
            href="/settings/merge-lessons"
            className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg text-sm hover:bg-navy-dark transition-colors"
          >
            重複コマを確認・統合する
          </Link>
        </div>

        {/* バックアップ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">設定のバックアップ</h2>
          <p className="text-sm text-gray-500 mb-4">
            ブース・期間区分・休校日などの設定データをJSONファイルとしてダウンロードします。
          </p>
          <a
            href="/api/export/settings"
            download
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            設定をダウンロード（JSON）
          </a>
        </div>
      </div>
    </div>
  )
}
