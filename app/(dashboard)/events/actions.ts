'use server'

import { createClient } from '@/lib/supabase/server'

export interface EventFormData {
  title: string
  description: string
  start_at: string
  end_at: string
  teacher_id: string
}

export async function createEvent(data: EventFormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('events').insert({
    title: data.title,
    description: data.description || null,
    start_at: data.start_at,
    end_at: data.end_at,
    teacher_id: data.teacher_id || null,
  })
  if (error) return { error: error.message }
  return {}
}

export async function updateEvent(id: string, data: EventFormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('events').update({
    title: data.title,
    description: data.description || null,
    start_at: data.start_at,
    end_at: data.end_at,
    teacher_id: data.teacher_id || null,
  }).eq('id', id)
  if (error) return { error: error.message }
  return {}
}

export async function deleteEvent(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) return { error: error.message }
  return {}
}
