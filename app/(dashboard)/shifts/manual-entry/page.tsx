import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { ManualShiftEntry } from './ManualShiftEntry'
import Link from 'next/link'

export default async function ManualShiftEntryPage() {
  const supabase = await createClient()
  const [{ data: teachers }, { data: intensivePeriods }] = await Promise.all([
    supabase.from('teachers').select('id, name').order('name'),
    supabase.from('term_periods').select('id, name, start_date, end_date').eq('type', 'intensive').order('start_date'),
  ])

  return (
    <div>
      <Header
        title="手動シフト入力"
        subtitle="紙でもらったシフトをまとめて登録できます"
        actions={
          <Link
            href="/shifts"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700"
          >
            ← シフト管理に戻る
          </Link>
        }
      />
      <ManualShiftEntry teachers={teachers ?? []} intensivePeriods={intensivePeriods ?? []} />
    </div>
  )
}
