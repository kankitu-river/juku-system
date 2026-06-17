'use server'

import { createClient } from '@/lib/supabase/server'

export interface ShiftFormData {
  teacher_id: string
  date: string
  start_time: string
  end_time: string
}

export async function upsertShift(data: ShiftFormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('shifts')
    .upsert(data, { onConflict: 'teacher_id,date' })
  if (error) return { error: error.message }
  return {}
}

export async function deleteShift(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('shifts').delete().eq('id', id)
  if (error) return { error: error.message }
  return {}
}
