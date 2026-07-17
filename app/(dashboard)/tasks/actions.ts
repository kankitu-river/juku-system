'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateTaskStatus(id: string, status: 'pending' | 'in_progress' | 'done' | 'skipped') {
  const supabase = await createClient()
  const completed_at = status === 'done' || status === 'skipped' ? new Date().toISOString() : null
  const { error } = await supabase
    .from('tasks')
    .update({ status, completed_at })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/tasks')
  revalidatePath('/')
  return {}
}

export async function createManualTask(data: { title: string; description?: string; due_date: string }) {
  const supabase = await createClient()
  const { error } = await supabase.from('tasks').insert({
    title: data.title,
    description: data.description ?? null,
    due_date: data.due_date,
  })
  if (error) return { error: error.message }
  revalidatePath('/tasks')
  return {}
}

export async function deleteTask(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/tasks')
  revalidatePath('/')
  return {}
}
