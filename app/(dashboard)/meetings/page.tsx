import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { MeetingList } from './MeetingList'

export default async function MeetingsPage() {
  const supabase = await createClient()
  const { data: meetings } = await supabase
    .from('meeting_notes')
    .select('id, title, meeting_date, summary')
    .order('meeting_date', { ascending: false })

  return (
    <div>
      <Header title="議事録" subtitle="ミーティングのメモを管理・要約します" />
      <MeetingList meetings={meetings ?? []} />
    </div>
  )
}
