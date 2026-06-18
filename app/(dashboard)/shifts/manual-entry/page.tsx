import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { ManualShiftEntry } from './ManualShiftEntry'
import Link from 'next/link'

export default async function ManualShiftEntryPage() {
  const supabase = await createClient()
  const { data: teachers } = await supabase.from('teachers').select('id, name').order('name')

  return (
    <div>
      <Header
        title="手動シフト入力"
        subtitle="紙でもらったシフトをまとめて登録できます"
        actions={
          <Link
            href="/shifts"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← シフト管理に戻る
          </Link>
        }
      />
      <ManualShiftEntry teachers={teachers ?? []} />
    </div>
  )
}
