'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateBoothName(id: string, name: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('booths').update({ name }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/booths')
  return {}
}

export async function addBooth(name: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: existing } = await supabase.from('booths').select('sort_order').order('sort_order', { ascending: false }).limit(1).single()
  const nextOrder = ((existing?.sort_order ?? 0) as number) + 10
  const { error } = await supabase.from('booths').insert({ name, is_active: true, sort_order: nextOrder })
  if (error) return { error: error.message }
  revalidatePath('/booths')
  return {}
}

export async function deleteBooth(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { count } = await supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('booth_id', id)
  if ((count ?? 0) > 0) return { error: 'このブースにはコマが割り当てられているため削除できません' }
  const { error } = await supabase.from('booths').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/booths')
  return {}
}

export async function toggleBoothActive(id: string, isActive: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('booths').update({ is_active: isActive }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/booths')
  return {}
}

export async function swapBoothOrder(idA: string, orderA: number, idB: string, orderB: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error: e1 } = await supabase.from('booths').update({ sort_order: orderB }).eq('id', idA)
  if (e1) return { error: e1.message }
  const { error: e2 } = await supabase.from('booths').update({ sort_order: orderA }).eq('id', idB)
  if (e2) return { error: e2.message }
  revalidatePath('/booths')
  return {}
}

export async function updateBoothAssignment(
  lessonId: string,
  boothId: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lessons')
    .update({ booth_id: boothId })
    .eq('id', lessonId)
  if (error) return { error: error.message }
  revalidatePath('/booths')
  revalidatePath('/schedule')
  return {}
}
