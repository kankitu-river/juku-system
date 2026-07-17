'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function reorderWaitlist(supabase: Awaited<ReturnType<typeof createClient>>, lessonId: string) {
  const { data: entries } = await supabase
    .from('waitlist')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('status', 'waiting')
    .order('position', { ascending: true })

  if (!entries) return
  for (let i = 0; i < entries.length; i++) {
    await supabase.from('waitlist').update({ position: i + 1 }).eq('id', entries[i].id)
  }
}

export async function addToWaitlist(lessonId: string, studentId: string, notes?: string) {
  const supabase = await createClient()

  // 既に登録済みなら追加しない
  const { data: existing } = await supabase
    .from('waitlist')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId)
    .eq('status', 'waiting')
    .limit(1)

  if (existing && existing.length > 0) return { error: 'すでにキャンセル待ちに登録されています' }

  // 既に受講中なら追加しない
  const { data: enrolled } = await supabase
    .from('lesson_enrollments')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId)
    .limit(1)

  if (enrolled && enrolled.length > 0) return { error: 'すでに受講登録されています' }

  // 現在の最大 position を取得
  const { data: maxRow } = await supabase
    .from('waitlist')
    .select('position')
    .eq('lesson_id', lessonId)
    .eq('status', 'waiting')
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition = maxRow && maxRow.length > 0 ? (maxRow[0].position as number) + 1 : 1

  const { error } = await supabase.from('waitlist').insert({
    lesson_id: lessonId,
    student_id: studentId,
    position: nextPosition,
    notes: notes ?? null,
  })

  if (error) return { error: error.message }
  revalidatePath(`/schedule/${lessonId}`)
  return {}
}

export async function promoteFromWaitlist(waitlistId: string, lessonId: string, studentId: string) {
  const supabase = await createClient()

  // 定員チェック
  const [{ data: lesson }, { count: enrollCount }] = await Promise.all([
    supabase.from('lessons').select('capacity').eq('id', lessonId).single(),
    supabase.from('lesson_enrollments').select('id', { count: 'exact', head: true }).eq('lesson_id', lessonId),
  ])

  if (lesson && enrollCount !== null && enrollCount >= (lesson.capacity as number)) {
    return { error: '定員に達しているため繰り上げできません' }
  }

  // 受講登録を作成
  const { error: enrollError } = await supabase
    .from('lesson_enrollments')
    .insert({ lesson_id: lessonId, student_id: studentId })

  if (enrollError) return { error: enrollError.message }

  // waitlist を promoted に更新
  await supabase
    .from('waitlist')
    .update({ status: 'promoted', promoted_at: new Date().toISOString() })
    .eq('id', waitlistId)

  await reorderWaitlist(supabase, lessonId)
  revalidatePath(`/schedule/${lessonId}`)
  return {}
}

export async function cancelWaitlist(waitlistId: string, lessonId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('waitlist')
    .update({ status: 'cancelled' })
    .eq('id', waitlistId)
  if (error) return { error: error.message }
  await reorderWaitlist(supabase, lessonId)
  revalidatePath(`/schedule/${lessonId}`)
  return {}
}
