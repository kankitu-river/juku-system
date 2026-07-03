import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { EventForm } from '@/components/events/EventForm'
import { updateEvent, deleteEvent } from '../actions'
import type { Teacher } from '@/types'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: teachers }] = await Promise.all([
    supabase.from('events').select('*, teacher:teachers(name)').eq('id', id).single(),
    supabase.from('teachers').select('*').order('name'),
  ])

  if (!event) notFound()

  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  const dateLabel = start.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
  const timeLabel = `${start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 〜 ${end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <div>
      <Header title={event.title} subtitle={`${dateLabel} ${timeLabel}`} />
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 max-w-2xl">
        <EventForm
          event={event}
          teachers={(teachers as Teacher[]) ?? []}
          onSave={updateEvent.bind(null, id)}
          onDelete={deleteEvent.bind(null, id)}
        />
      </div>
    </div>
  )
}
