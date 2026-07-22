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

type AssignLesson = { id: string; type: string; slot_index: number; specific_date?: string | null; day_of_week?: number | null }
type AssignBooth = { id: string; name: string; booth_type: string }

function chunkArr<T>(a: T[], n: number): T[][] {
  const o: T[][] = []
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n))
  return o
}

// 集団ブース判定: 種別 group_preferred または 名前に「集団」を含む
function isGroupBooth(b: AssignBooth): boolean {
  return b.booth_type === 'group_preferred' || b.name.includes('集団')
}

// 貪欲法でブースを割り当てて更新する（同一 日付×コマ で重複しない。集団は集団ブース優先、個別は集団ブースを避ける）
async function applyBoothAssignments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessons: AssignLesson[],
  booths: AssignBooth[],
): Promise<number> {
  const groupBooths = booths.filter(isGroupBooth)
  const indivBooths = booths.filter((b) => !isGroupBooth(b))

  // 日付×コマ でまとめる
  const byKey = new Map<string, AssignLesson[]>()
  for (const l of lessons) {
    const key = `${l.specific_date ?? l.day_of_week ?? 'x'}|${l.slot_index}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(l)
  }

  const boothToLessons = new Map<string, string[]>()
  let assigned = 0
  const add = (boothId: string, lessonId: string) => {
    if (!boothToLessons.has(boothId)) boothToLessons.set(boothId, [])
    boothToLessons.get(boothId)!.push(lessonId)
    assigned++
  }

  for (const [, group] of byKey) {
    const used = new Set<string>()
    // 集団授業を先に集団ブースへ
    for (const l of group.filter((x) => x.type === 'group')) {
      const b = groupBooths.find((x) => !used.has(x.id))
        ?? indivBooths.find((x) => !used.has(x.id))
        ?? booths.find((x) => !used.has(x.id))
      if (!b) continue
      used.add(b.id); add(b.id, l.id)
    }
    // 個別指導は集団ブースを避けて割当
    for (const l of group.filter((x) => x.type !== 'group')) {
      const b = indivBooths.find((x) => !used.has(x.id))
        ?? booths.find((x) => !used.has(x.id))
      if (!b) continue
      used.add(b.id); add(b.id, l.id)
    }
  }

  // ブースごとにまとめて更新
  for (const [boothId, ids] of boothToLessons) {
    for (const c of chunkArr(ids, 200)) {
      await supabase.from('lessons').update({ booth_id: boothId }).in('id', c)
    }
  }
  return assigned
}

// 1日分のブース自動割り当て（未割り当てのコマのみ）
export async function autoAssignBooths(dateStr: string, dow: number, termType: string): Promise<{ assigned: number; error?: string }> {
  const supabase = await createClient()

  const [{ data: booths }, { data: tempLessons }, { data: regularLessons }] = await Promise.all([
    supabase.from('booths').select('id, name, booth_type').eq('is_active', true).order('sort_order'),
    supabase.from('lessons').select('id, type, slot_index, specific_date')
      .eq('specific_date', dateStr).eq('lesson_kind', 'temporary').is('booth_id', null),
    supabase.from('lessons').select('id, type, slot_index, day_of_week')
      .eq('day_of_week', dow).eq('lesson_kind', 'regular').eq('term_type', termType).is('booth_id', null),
  ])

  const lessons = [...(tempLessons ?? []), ...(regularLessons ?? [])] as AssignLesson[]
  if (lessons.length === 0 || !booths || booths.length === 0) return { assigned: 0 }

  const assigned = await applyBoothAssignments(supabase, lessons, booths as AssignBooth[])
  revalidatePath('/booths')
  revalidatePath('/schedule')
  return { assigned }
}

// 講習期間まるごとブースを自動割り当て（期間内の全講習コマを再割り当て）
export async function autoAssignIntensivePeriod(dateStr: string): Promise<{ assigned: number; days: number; error?: string }> {
  const supabase = await createClient()

  const { data: periods } = await supabase.from('term_periods').select('start_date, end_date, type').eq('type', 'intensive')
  const period = (periods ?? []).find((p) => p.start_date <= dateStr && p.end_date >= dateStr)
  if (!period) return { assigned: 0, days: 0, error: 'この日を含む講習期間が見つかりません' }

  const [{ data: booths }, { data: lessons }] = await Promise.all([
    supabase.from('booths').select('id, name, booth_type').eq('is_active', true).order('sort_order'),
    supabase.from('lessons').select('id, type, slot_index, specific_date')
      .eq('term_type', 'intensive').eq('lesson_kind', 'temporary')
      .gte('specific_date', period.start_date).lte('specific_date', period.end_date),
  ])
  if (!booths || booths.length === 0) return { assigned: 0, days: 0, error: 'ブースがありません' }
  if (!lessons || lessons.length === 0) return { assigned: 0, days: 0 }

  const assigned = await applyBoothAssignments(supabase, lessons as AssignLesson[], booths as AssignBooth[])
  const days = new Set((lessons as { specific_date: string }[]).map((l) => l.specific_date)).size
  revalidatePath('/booths')
  revalidatePath('/schedule')
  return { assigned, days }
}
