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

export async function copyShiftsToNextWeek(currentWeekDates: string[]): Promise<{ count?: number; error?: string }> {
  const supabase = await createClient()
  const { data: shifts, error: fetchError } = await supabase
    .from('shifts')
    .select('teacher_id, start_time, end_time, date')
    .in('date', currentWeekDates)
  if (fetchError) return { error: fetchError.message }
  if (!shifts?.length) return { count: 0 }

  const nextWeekShifts = shifts.map((shift) => {
    const d = new Date(shift.date)
    d.setDate(d.getDate() + 7)
    return {
      teacher_id: shift.teacher_id,
      date: d.toISOString().split('T')[0],
      start_time: shift.start_time,
      end_time: shift.end_time,
    }
  })
  const { error: insertError } = await supabase
    .from('shifts')
    .upsert(nextWeekShifts, { onConflict: 'teacher_id,date' })
  if (insertError) return { error: insertError.message }
  return { count: nextWeekShifts.length }
}
