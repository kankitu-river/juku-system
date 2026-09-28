'use server'

import { createClient } from '@/lib/supabase/server'
import { recordAttendance } from '@/app/(dashboard)/attendance/actions'
import { revalidatePath } from 'next/cache'

export type MakeupStatus = 'pending' | 'scheduled' | 'completed'

export interface MakeupRequestInput {
  studentId: string | null
  studentName: string
  subject: string
  originalLesson: string
  desiredRaw: string
  scheduledDate: string | null
  status: MakeupStatus
  nextTestDate: string
  notes: string
}

function revalidate() {
  revalidatePath('/attendance/makeup/ledger')
  revalidatePath('/attendance/makeup')
}

type Supa = Awaited<ReturnType<typeof createClient>>
interface Placement { student_id: string | null; assigned_lesson_id: string | null; assigned_date: string | null }

// コマ配置を解除：紐付いた makeup_assignment と出欠(makeup_used)を消す
async function removePlacement(supabase: Supa, req: Placement) {
  if (!req.student_id || !req.assigned_lesson_id || !req.assigned_date) return
  await supabase.from('makeup_assignments').delete()
    .eq('student_id', req.student_id)
    .eq('lesson_id', req.assigned_lesson_id)
    .eq('assigned_date', req.assigned_date)
  await supabase.from('attendances').delete()
    .eq('student_id', req.student_id)
    .eq('lesson_id', req.assigned_lesson_id)
    .eq('date', req.assigned_date)
}

export async function addMakeupRequest(input: MakeupRequestInput): Promise<{ error?: string }> {
  if (!input.studentName.trim() && !input.studentId) return { error: '生徒を選択してください' }
  const supabase = await createClient()
  const { error } = await supabase.from('makeup_requests').insert({
    student_id: input.studentId,
    student_name: input.studentName,
    subject: input.subject,
    original_lesson: input.originalLesson,
    desired_raw: input.desiredRaw,
    scheduled_date: input.status === 'pending' ? null : input.scheduledDate,
    status: input.status,
    next_test_date: input.nextTestDate,
    notes: input.notes,
    source_sheet: 'アプリ入力',
  })
  if (error) return { error: error.message }
  revalidate()
  return {}
}

export async function updateMakeupRequest(id: string, input: MakeupRequestInput): Promise<{ error?: string }> {
  const supabase = await createClient()
  const patch: Record<string, unknown> = {
    student_id: input.studentId,
    student_name: input.studentName,
    subject: input.subject,
    original_lesson: input.originalLesson,
    desired_raw: input.desiredRaw,
    scheduled_date: input.status === 'pending' ? null : input.scheduledDate,
    status: input.status,
    next_test_date: input.nextTestDate,
    notes: input.notes,
  }
  // 未定に戻す編集ではコマ配置も解除する（不整合防止）
  if (input.status === 'pending') {
    const { data: req } = await supabase
      .from('makeup_requests')
      .select('student_id, assigned_lesson_id, assigned_date')
      .eq('id', id)
      .single()
    if (req) await removePlacement(supabase, req)
    patch.assigned_lesson_id = null
    patch.assigned_date = null
  }
  const { error } = await supabase.from('makeup_requests').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidate()
  return {}
}

// 未定 →（日付を入れて）決定
export async function scheduleMakeupRequest(id: string, scheduledDate: string): Promise<{ error?: string }> {
  if (!scheduledDate) return { error: '振替日を入力してください' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('makeup_requests')
    .update({ status: 'scheduled', scheduled_date: scheduledDate })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidate()
  return {}
}

// 消化済みにする
export async function completeMakeupRequest(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('makeup_requests').update({ status: 'completed' }).eq('id', id)
  if (error) return { error: error.message }
  revalidate()
  return {}
}

// 状態を戻す（済/決定 → 未定 など任意）。未定に戻すときはコマ配置も解除する。
export async function setMakeupStatus(id: string, status: MakeupStatus): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: req } = await supabase
    .from('makeup_requests')
    .select('student_id, assigned_lesson_id, assigned_date')
    .eq('id', id)
    .single()
  const patch: Record<string, unknown> = { status }
  if (status === 'pending') {
    if (req) await removePlacement(supabase, req)
    patch.scheduled_date = null
    patch.assigned_lesson_id = null
    patch.assigned_date = null
  }
  const { error } = await supabase.from('makeup_requests').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidate()
  if (req?.assigned_lesson_id) revalidatePath(`/schedule/${req.assigned_lesson_id}`)
  return {}
}

// コマ配置だけを取り消す（振替自体は「決定」のまま残し、置き直せるようにする）
export async function unassignMakeupRequest(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: req } = await supabase
    .from('makeup_requests')
    .select('student_id, assigned_lesson_id, assigned_date')
    .eq('id', id)
    .single()
  if (!req) return { error: '振替が見つかりません' }
  await removePlacement(supabase, req)
  const { error } = await supabase
    .from('makeup_requests')
    .update({ assigned_lesson_id: null, assigned_date: null, status: 'scheduled' })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidate()
  if (req.assigned_lesson_id) revalidatePath(`/schedule/${req.assigned_lesson_id}`)
  return {}
}

export async function deleteMakeupRequest(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: req } = await supabase
    .from('makeup_requests')
    .select('student_id, assigned_lesson_id, assigned_date')
    .eq('id', id)
    .single()
  if (req) await removePlacement(supabase, req)
  const { error } = await supabase.from('makeup_requests').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidate()
  if (req?.assigned_lesson_id) revalidatePath(`/schedule/${req.assigned_lesson_id}`)
  return {}
}

// ── コマ詳細ページからの操作（台帳に直結） ──────────────────────

// 欠席にして振替へ回す：出欠を欠席で記録し、台帳に未定の振替を1件作る
export async function markAbsentToLedger(input: {
  studentId: string
  studentName: string
  subject: string
  lessonId: string
  date: string
  originalLabel: string
}): Promise<{ error?: string }> {
  const att = await recordAttendance(input.studentId, input.lessonId, input.date, 'absent', false)
  if (att.error) return att
  const supabase = await createClient()
  const { error } = await supabase.from('makeup_requests').insert({
    student_id: input.studentId,
    student_name: input.studentName,
    subject: input.subject,
    original_lesson: input.originalLabel,
    desired_raw: '',
    scheduled_date: null,
    status: 'pending',
    next_test_date: '',
    notes: '',
    source_sheet: 'アプリ入力',
  })
  if (error) return { error: error.message }
  revalidate()
  revalidatePath(`/schedule/${input.lessonId}`)
  return {}
}

// 台帳の1件を、このコマ・この日に配置する（＝「決定・配置済」）。
// 既に別コマに配置済みなら、前の割当・出欠を消してから置き直す（再振替）。
// 実際に受講したら completeMakeupRequest で「済」にする。
export async function assignMakeupFromLedger(
  requestId: string,
  lessonId: string,
  date: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: req } = await supabase
    .from('makeup_requests')
    .select('id, student_id, assigned_lesson_id, assigned_date')
    .eq('id', requestId)
    .single()
  if (!req) return { error: '振替が見つかりません' }
  if (!req.student_id) return { error: 'この振替は生徒が名簿未一致のため割り当てできません。先に台帳で生徒を紐付けてください' }

  const prevLessonId = req.assigned_lesson_id
  // 置き直し：前のコマ割当・出欠を消す
  await removePlacement(supabase, req)

  const [a, u, att] = await Promise.all([
    supabase.from('makeup_assignments').insert({ student_id: req.student_id, lesson_id: lessonId, assigned_date: date }),
    supabase.from('makeup_requests')
      .update({ status: 'scheduled', scheduled_date: date, assigned_lesson_id: lessonId, assigned_date: date })
      .eq('id', requestId),
    supabase.from('attendances').upsert(
      { student_id: req.student_id, lesson_id: lessonId, date, status: 'makeup_used', makeup_credited: false },
      { onConflict: 'student_id,lesson_id,date' }
    ),
  ])
  if (a.error) return { error: a.error.message }
  if (u.error) return { error: u.error.message }
  if (att.error) return { error: att.error.message }
  revalidate()
  revalidatePath(`/schedule/${lessonId}`)
  if (prevLessonId && prevLessonId !== lessonId) revalidatePath(`/schedule/${prevLessonId}`)
  return {}
}
