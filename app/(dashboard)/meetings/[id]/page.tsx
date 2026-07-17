import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { MeetingDetail } from './MeetingDetail'
import { notFound } from 'next/navigation'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MeetingDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: meeting }, { data: tasks }] = await Promise.all([
    supabase
      .from('meeting_notes')
      .select('id, title, meeting_date, raw_text, summary')
      .eq('id', id)
      .single(),
    supabase
      .from('meeting_tasks')
      .select('id, title, assignee, due_date, status')
      .eq('meeting_id', id)
      .order('created_at'),
  ])

  if (!meeting) notFound()

  return (
    <div>
      <Header
        title={meeting.title}
        subtitle={meeting.meeting_date}
        actions={
          <Link href="/meetings" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            ← 一覧へ
          </Link>
        }
      />
      <MeetingDetail
        id={meeting.id}
        title={meeting.title}
        meeting_date={meeting.meeting_date}
        raw_text={meeting.raw_text ?? ''}
        summary={meeting.summary ?? null}
        tasks={tasks ?? []}
      />
    </div>
  )
}
