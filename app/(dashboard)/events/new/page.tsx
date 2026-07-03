import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { EventForm } from '@/components/events/EventForm'
import { createEvent } from '../actions'
import type { Teacher } from '@/types'

export default async function NewEventPage() {
  const supabase = await createClient()
  const { data: teachers } = await supabase.from('teachers').select('*').order('name')

  return (
    <div>
      <Header title="イベントを登録" subtitle="新しいイベント・講習会を追加します" />
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 max-w-2xl">
        <EventForm teachers={(teachers as Teacher[]) ?? []} onSave={createEvent} />
      </div>
    </div>
  )
}
