'use server'

import { createClient } from '@/lib/supabase/server'
import type { TermPeriod, TermType, TimeSlot } from '@/types'
import { revalidatePath } from 'next/cache'

// ---- 休校日 ----

export async function toggleClosure(date: string): Promise<{ closed: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('school_closures').select('id').eq('date', date).single()

  if (existing) {
    await supabase.from('school_closures').delete().eq('date', date)
    revalidatePath('/schedule')
    return { closed: false }
  } else {
    await supabase.from('school_closures').insert({ date })
    revalidatePath('/schedule')
    return { closed: true }
  }
}

// ---- 時間帯スロット設定 ----

export interface TimeSlotConfig {
  regular: TimeSlot[]
  intensive: TimeSlot[]
  group_saturday: TimeSlot[]
  saturday_individual: TimeSlot[]
}

export async function saveTimeSlots(config: TimeSlotConfig): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'time_slots', value: config, updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath('/schedule')
  return {}
}

export async function getTimeSlots(): Promise<TimeSlotConfig | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('app_settings').select('value').eq('key', 'time_slots').single()
  return (data?.value as TimeSlotConfig) ?? null
}

interface TermPeriodData {
  name: string
  type: TermType
  start_date: string
  end_date: string
}

export async function createTermPeriod(
  data: TermPeriodData
): Promise<{ data?: TermPeriod; error?: string }> {
  const supabase = await createClient()

  const { data: result, error } = await supabase
    .from('term_periods')
    .insert(data)
    .select()
    .single()

  if (error) return { error: error.message }
  return { data: result as TermPeriod }
}

export async function deleteTermPeriod(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.from('term_periods').delete().eq('id', id)

  if (error) return { error: error.message }
  return {}
}

// ---- 講習期間コマ上限設定 ----

export type { IntensiveSlotLimits } from '@/lib/constants/timeSlots'
import type { IntensiveSlotLimits } from '@/lib/constants/timeSlots'

export async function saveIntensiveSlotLimits(limits: IntensiveSlotLimits): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'intensive_slot_limits', value: limits, updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath('/schedule/intensive')
  return {}
}
