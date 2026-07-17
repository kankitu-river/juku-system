'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateJSON } from '@/lib/ai/client'
import { SYSTEM_MEETING_SUMMARY } from '@/lib/ai/prompts/meetingSummary'

interface MeetingTaskExtracted {
  title: string
  assignee: string | null
  due_date: string | null
}

interface SummaryResult {
  summary: string
  tasks: MeetingTaskExtracted[]
}

export async function createMeeting(formData: FormData) {
  const supabase = await createClient()
  const title = formData.get('title') as string
  const meeting_date = formData.get('meeting_date') as string
  const raw_text = formData.get('raw_text') as string

  if (!title || !meeting_date) return { error: 'タイトルと日付は必須です' }

  const { data: { user } } = await supabase.auth.getUser()

  const { data: meeting, error } = await supabase
    .from('meeting_notes')
    .insert({ title, meeting_date, raw_text, created_by: user?.id })
    .select('id')
    .single()

  if (error || !meeting) return { error: error?.message ?? '作成失敗' }

  revalidatePath('/meetings')
  return { id: meeting.id }
}

export async function updateMeetingText(id: string, raw_text: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('meeting_notes')
    .update({ raw_text })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/meetings')
  return {}
}

export async function generateMeetingSummary(id: string) {
  const supabase = await createClient()
  const { data: meeting } = await supabase
    .from('meeting_notes')
    .select('raw_text')
    .eq('id', id)
    .single()

  if (!meeting?.raw_text) return { error: 'メモがありません' }

  const result = await generateJSON<SummaryResult>(SYSTEM_MEETING_SUMMARY, meeting.raw_text, 1024)
  if (!result) return { error: 'AI解析に失敗しました' }

  const { error: updateErr } = await supabase
    .from('meeting_notes')
    .update({ summary: result.summary })
    .eq('id', id)

  if (updateErr) return { error: updateErr.message }

  if (result.tasks.length > 0) {
    await supabase.from('meeting_tasks').insert(
      result.tasks.map((t) => ({
        meeting_id: id,
        title: t.title,
        assignee: t.assignee,
        due_date: t.due_date,
      }))
    )
  }

  revalidatePath('/meetings')
  revalidatePath(`/meetings/${id}`)
  return { summary: result.summary, taskCount: result.tasks.length }
}

export async function toggleMeetingTask(taskId: string, done: boolean) {
  const supabase = await createClient()
  await supabase
    .from('meeting_tasks')
    .update({ status: done ? 'done' : 'pending' })
    .eq('id', taskId)
  revalidatePath('/meetings')
}

export async function deleteMeeting(id: string) {
  const supabase = await createClient()
  await supabase.from('meeting_notes').delete().eq('id', id)
  revalidatePath('/meetings')
}
