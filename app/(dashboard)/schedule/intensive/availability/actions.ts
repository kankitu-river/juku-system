'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleSlotAvailability(
  studentId: string,
  termPeriodId: string,
  date: string,
  slotIndex: number,
  available: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient()

  if (available) {
    const { error } = await supabase
      .from('intensive_student_availability')
      .upsert(
        { student_id: studentId, term_period_id: termPeriodId, date, slot_index: slotIndex },
        { onConflict: 'student_id,term_period_id,date,slot_index' }
      )
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('intensive_student_availability')
      .delete()
      .eq('student_id', studentId)
      .eq('term_period_id', termPeriodId)
      .eq('date', date)
      .eq('slot_index', slotIndex)
    if (error) return { error: error.message }
  }

  revalidatePath('/schedule/intensive/availability')
  return {}
}

export async function setDayAvailability(
  studentId: string,
  termPeriodId: string,
  date: string,
  slotIndices: number[]
): Promise<{ error?: string }> {
  const supabase = await createClient()

  await supabase
    .from('intensive_student_availability')
    .delete()
    .eq('student_id', studentId)
    .eq('term_period_id', termPeriodId)
    .eq('date', date)

  if (slotIndices.length > 0) {
    const { error } = await supabase
      .from('intensive_student_availability')
      .insert(slotIndices.map((slot_index) => ({
        student_id: studentId,
        term_period_id: termPeriodId,
        date,
        slot_index,
      })))
    if (error) return { error: error.message }
  }

  revalidatePath('/schedule/intensive/availability')
  return {}
}

export async function saveStudentNotes(
  studentId: string,
  termPeriodId: string,
  notes: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('intensive_student_notes')
    .upsert(
      { student_id: studentId, term_period_id: termPeriodId, notes, updated_at: new Date().toISOString() },
      { onConflict: 'student_id,term_period_id' }
    )
  if (error) return { error: error.message }
  revalidatePath('/schedule/intensive/availability')
  return {}
}
