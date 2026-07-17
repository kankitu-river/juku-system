import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { SchoolEventManager } from './SchoolEventManager'
import { getJstTodayStr } from '@/lib/utils/datetime'

export default async function SchoolEventsPage() {
  const supabase = await createClient()
  const today = getJstTodayStr()

  const { data: events } = await supabase
    .from('school_events')
    .select('*')
    .gte('end_date', today)
    .order('start_date', { ascending: true })

  type SchoolEvent = { id: string; school_name: string; event_type: string; title: string; start_date: string; end_date: string; notes: string | null }

  return (
    <div>
      <Header title="学校行事カレンダー" subtitle="定期テスト・行事・休校日を登録します" />
      <SchoolEventManager initialEvents={(events ?? []) as SchoolEvent[]} />
    </div>
  )
}
