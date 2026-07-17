'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createSchoolEvent(data: {
  school_name: string
  event_type: string
  title: string
  start_date: string
  end_date: string
  notes?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('school_events').insert(data)
  if (error) return { error: error.message }
  revalidatePath('/school-events')
  revalidatePath('/schedule')
  return {}
}

export async function deleteSchoolEvent(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('school_events').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/school-events')
  return {}
}
