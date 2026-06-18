'use server'

import { createClient } from '@/lib/supabase/server'

export async function saveManualShifts(
  teacherId: string,
  shifts: { date: string; start_time: string; end_time: string }[]
): Promise<{ saved: number; error?: string }> {
  if (!teacherId || shifts.length === 0) return { saved: 0 }
  const supabase = await createClient()

  const dates = shifts.map((s) => s.date)
  await supabase.from('shifts').delete().eq('teacher_id', teacherId).in('date', dates)

  const { error } = await supabase.from('shifts').insert(
    shifts.map((s) => ({ teacher_id: teacherId, ...s }))
  )
  if (error) return { saved: 0, error: error.message }
  return { saved: shifts.length }
}
