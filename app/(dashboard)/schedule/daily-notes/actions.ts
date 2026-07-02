'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getDailyNote(date: string): Promise<{ content: string }> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('daily_notes')
    .select('content')
    .eq('date', date)
    .maybeSingle()
  return { content: data?.content ?? '' }
}

export async function saveDailyNote(
  date: string,
  content: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('daily_notes')
    .upsert({ date, content }, { onConflict: 'date' })
  if (error) return { error: error.message }
  revalidatePath('/schedule')
  revalidatePath('/schedule/print/day')
  return {}
}
