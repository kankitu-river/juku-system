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

type AssignLesson = { id: string; type: string; slot_index: number; specific_date?: string | null; day_of_week?: number | null; teacher_id?: string | null }
type AssignBooth = { id: string; name: string; booth_type: string }

// 優先ブース番号（空きがあればここから使う）
const PRIORITY_NUMS = [2, 5, 6, 7, 10, 12, 14]
// 鶴丸・奥山が優先するブース番号
const PREFER_25 = [2, 5]

function chunkArr<T>(a: T[], n: number): T[][] {
  const o: T[][] = []
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n))
  return o
}

function isGroupBooth(b: AssignBooth): boolean {
  return b.booth_type === 'group_preferred' || b.name.includes('集団')
}

function boothNum(name: string): number | null {
  const m = name.match(/ブース\s*(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

// 個別コマ用のブース候補を優先順で並べる
// - hasGroup（同じコマに集団授業あり）なら 2,5 は候補から除外
// - isPref（鶴丸・奥山）なら 2,5 を最優先、それ以外は 2,5 を優先ブースの最後に回す
function orderCandidates(indivBooths: AssignBooth[], isPref: boolean, hasGroup: boolean): AssignBooth[] {
  let pool = indivBooths
  if (hasGroup) pool = pool.filter((b) => { const n = boothNum(b.name); return n !== 2 && n !== 5 })

  const prioNums = isPref
    ? [2, 5, 6, 7, 10, 12, 14]
    : [6, 7, 10, 12, 14, 2, 5]
  const prio: AssignBooth[] = []
  for (const n of prioNums) {
    const b = pool.find((x) => boothNum(x.name) === n)
    if (b && !prio.includes(b)) prio.push(b)
  }
  const rest = pool.filter((b) => !prio.includes(b))
  return [...prio, ...rest]
}

// ルールに沿ってブースを割り当てて更新する。
// 集団→集団ブース。個別→優先ブース。集団と同じコマは2,5回避。鶴丸/奥山は2,5優先。
// 連続コマで同じブースを別の先生が使わないようにする。
async function applyBoothAssignments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessons: AssignLesson[],
  booths: AssignBooth[],
  preferIds: Set<string>,
): Promise<number> {
  const groupBooths = booths.filter(isGroupBooth)
  const indivBooths = booths.filter((b) => !isGroupBooth(b))

  // 日付でまとめる
  const byDate = new Map<string, AssignLesson[]>()
  for (const l of lessons) {
    const d = l.specific_date ?? String(l.day_of_week ?? 'x')
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(l)
  }

  const boothToLessons = new Map<string, string[]>()
  let assigned = 0
  const add = (boothId: string, lessonId: string) => {
    if (!boothToLessons.has(boothId)) boothToLessons.set(boothId, [])
    boothToLessons.get(boothId)!.push(lessonId)
    assigned++
  }

  for (const [, dayLessons] of byDate) {
    // コマ番号でまとめ、昇順に処理
    const bySlot = new Map<number, AssignLesson[]>()
    for (const l of dayLessons) {
      if (!bySlot.has(l.slot_index)) bySlot.set(l.slot_index, [])
      bySlot.get(l.slot_index)!.push(l)
    }
    const slotNums = [...bySlot.keys()].sort((a, b) => a - b)

    let prevSlot = new Map<string, string>() // boothId -> teacher_id（前のコマ）

    for (const slot of slotNums) {
      const inSlot = bySlot.get(slot)!
      const groups = inSlot.filter((x) => x.type === 'group')
      const indivs = inSlot.filter((x) => x.type !== 'group')
      const hasGroup = groups.length > 0
      const used = new Set<string>()
      const thisSlot = new Map<string, string>()

      // 集団 → 集団ブース
      for (const l of groups) {
        const b = groupBooths.find((x) => !used.has(x.id))
          ?? indivBooths.find((x) => !used.has(x.id))
          ?? booths.find((x) => !used.has(x.id))
        if (!b) continue
        used.add(b.id); thisSlot.set(b.id, l.teacher_id ?? ''); add(b.id, l.id)
      }

      // 個別: 鶴丸/奥山を先に割り当てて 2,5 を確保
      const ordered = [...indivs].sort(
        (a, b) => (preferIds.has(b.teacher_id ?? '') ? 1 : 0) - (preferIds.has(a.teacher_id ?? '') ? 1 : 0)
      )
      for (const l of ordered) {
        const isPref = preferIds.has(l.teacher_id ?? '')
        const cand = orderCandidates(indivBooths, isPref, hasGroup).filter((b) => !used.has(b.id))
        // 連続コマで別の先生が使ったブースを避ける（無ければ許容）
        const noSwap = cand.filter((b) => {
          const t = prevSlot.get(b.id)
          return !t || t === (l.teacher_id ?? '')
        })
        const pick = noSwap[0] ?? cand[0]
        if (!pick) continue
        used.add(pick.id); thisSlot.set(pick.id, l.teacher_id ?? ''); add(pick.id, l.id)
      }

      prevSlot = thisSlot
    }
  }

  for (const [boothId, ids] of boothToLessons) {
    for (const c of chunkArr(ids, 200)) {
      await supabase.from('lessons').update({ booth_id: boothId }).in('id', c)
    }
  }
  return assigned
}

// 鶴丸・奥山の teacher_id を取得
async function getPreferTeacherIds(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Set<string>> {
  const { data } = await supabase.from('teachers').select('id, name')
  const ids = new Set<string>()
  for (const t of data ?? []) {
    if (t.name?.includes('鶴丸') || t.name?.includes('奥山')) ids.add(t.id as string)
  }
  return ids
}

// 1日分のブース自動割り当て（未割り当てのコマのみ）
export async function autoAssignBooths(dateStr: string, dow: number, termType: string): Promise<{ assigned: number; error?: string }> {
  const supabase = await createClient()

  const [{ data: booths }, { data: tempLessons }, { data: regularLessons }, preferIds] = await Promise.all([
    supabase.from('booths').select('id, name, booth_type').eq('is_active', true).order('sort_order'),
    supabase.from('lessons').select('id, type, slot_index, specific_date, teacher_id')
      .eq('specific_date', dateStr).eq('lesson_kind', 'temporary').is('booth_id', null),
    supabase.from('lessons').select('id, type, slot_index, day_of_week, teacher_id')
      .eq('day_of_week', dow).eq('lesson_kind', 'regular').eq('term_type', termType).is('booth_id', null),
    getPreferTeacherIds(supabase),
  ])

  const lessons = [...(tempLessons ?? []), ...(regularLessons ?? [])] as AssignLesson[]
  if (lessons.length === 0 || !booths || booths.length === 0) return { assigned: 0 }

  const assigned = await applyBoothAssignments(supabase, lessons, booths as AssignBooth[], preferIds)
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

  const [{ data: booths }, { data: lessons }, preferIds] = await Promise.all([
    supabase.from('booths').select('id, name, booth_type').eq('is_active', true).order('sort_order'),
    supabase.from('lessons').select('id, type, slot_index, specific_date, teacher_id')
      .eq('term_type', 'intensive').eq('lesson_kind', 'temporary')
      .gte('specific_date', period.start_date).lte('specific_date', period.end_date),
    getPreferTeacherIds(supabase),
  ])
  if (!booths || booths.length === 0) return { assigned: 0, days: 0, error: 'ブースがありません' }
  if (!lessons || lessons.length === 0) return { assigned: 0, days: 0 }

  const assigned = await applyBoothAssignments(supabase, lessons as AssignLesson[], booths as AssignBooth[], preferIds)
  const days = new Set((lessons as { specific_date: string }[]).map((l) => l.specific_date)).size
  revalidatePath('/booths')
  revalidatePath('/schedule')
  return { assigned, days }
}
