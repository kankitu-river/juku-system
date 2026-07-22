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

export async function toggleBoothType(id: string, type: 'individual' | 'group_preferred'): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('booths').update({ booth_type: type }).eq('id', id)
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

// 貪欲法でブースを自動割り当て（集団授業→group_preferred優先、個別指導→individual優先）
export async function autoAssignBooths(dateStr: string, dow: number, termType: string): Promise<{ assigned: number; error?: string }> {
  const supabase = await createClient()

  const [{ data: booths }, { data: regularIndividual }, { data: tempIndividual }, { data: regularGroup }, { data: tempGroup }] = await Promise.all([
    supabase.from('booths').select('id, sort_order, name, booth_type').eq('is_active', true).order('sort_order'),
    supabase
      .from('lessons')
      .select('id, type, booth_id, slot_index')
      .eq('day_of_week', dow)
      .eq('type', 'individual')
      .eq('lesson_kind', 'regular')
      .eq('term_type', termType)
      .is('booth_id', null),
    supabase
      .from('lessons')
      .select('id, type, booth_id, slot_index')
      .eq('specific_date', dateStr)
      .eq('type', 'individual')
      .eq('lesson_kind', 'temporary')
      .is('booth_id', null),
    supabase
      .from('lessons')
      .select('id, type, booth_id, slot_index')
      .eq('day_of_week', dow)
      .eq('type', 'group')
      .eq('lesson_kind', 'regular')
      .eq('term_type', termType)
      .is('booth_id', null),
    supabase
      .from('lessons')
      .select('id, type, booth_id, slot_index')
      .eq('specific_date', dateStr)
      .eq('type', 'group')
      .eq('lesson_kind', 'temporary')
      .is('booth_id', null),
  ])

  // 集団授業を先に割り当てて group_preferred ブースを確保する
  const groupLessons = [...(regularGroup ?? []), ...(tempGroup ?? [])].map((l) => ({ ...l, isGroup: true }))
  const individualLessons = [...(regularIndividual ?? []), ...(tempIndividual ?? [])].map((l) => ({ ...l, isGroup: false }))
  const unassigned = [...groupLessons, ...individualLessons]

  if (unassigned.length === 0 || !booths || booths.length === 0) return { assigned: 0 }

  // 既に使用中のブース（当日）を除外
  const { data: usedLessons } = await supabase
    .from('lessons')
    .select('booth_id, slot_index')
    .not('booth_id', 'is', null)
    .or(`day_of_week.eq.${dow},specific_date.eq.${dateStr}`)

  // slot -> 使用中boothId set
  const usedBySlot = new Map<number, Set<string>>()
  for (const l of usedLessons ?? []) {
    const slot = l.slot_index as number
    if (!usedBySlot.has(slot)) usedBySlot.set(slot, new Set())
    usedBySlot.get(slot)!.add(l.booth_id as string)
  }

  const allBooths = booths as { id: string; sort_order: number; booth_type: string }[]
  let assigned = 0

  for (const lesson of unassigned) {
    const slot = lesson.slot_index as number
    const taken = usedBySlot.get(slot) ?? new Set()
    const available = allBooths.filter((b) => !taken.has(b.id))
    if (available.length === 0) continue

    let booth: { id: string; sort_order: number; booth_type: string }
    if (lesson.isGroup) {
      // 集団授業: group_preferred 優先、なければ individual も使う
      booth = available.find((b) => b.booth_type === 'group_preferred') ?? available[0]
    } else {
      // 個別指導: individual 優先、なければ group_preferred も使う
      booth = available.find((b) => b.booth_type === 'individual') ?? available[0]
    }

    const { error } = await supabase.from('lessons').update({ booth_id: booth.id }).eq('id', lesson.id)
    if (!error) {
      taken.add(booth.id)
      usedBySlot.set(slot, taken)
      assigned++
    }
  }

  revalidatePath('/booths')
  return { assigned }
}
