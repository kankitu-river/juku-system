'use server'

import { createClient } from '@/lib/supabase/server'

// 出欠を記録（upsert）
export async function recordAttendance(
  studentId: string,
  lessonId: string,
  date: string,
  status: 'present' | 'absent' | 'makeup_used',
  makeupCredited: boolean = false
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.from('attendances').upsert(
    { student_id: studentId, lesson_id: lessonId, date, status, makeup_credited: makeupCredited },
    { onConflict: 'student_id,lesson_id,date' }
  )
  if (error) return { error: error.message }
  return {}
}

// 振替クレジットを1加算（有効期限付き）
export async function addMakeupCredit(studentId: string, expiresMonths = 3): Promise<{ error?: string }> {
  const supabase = await createClient()

  // makeup_credits が存在しない場合は作成
  const { data: existing } = await supabase
    .from('makeup_credits')
    .select('id, total_credits')
    .eq('student_id', studentId)
    .single()

  const expires = new Date()
  expires.setMonth(expires.getMonth() + expiresMonths)
  const expiresAt = expires.toISOString().slice(0, 10)

  if (existing) {
    const { error } = await supabase
      .from('makeup_credits')
      .update({ total_credits: existing.total_credits + 1, expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('student_id', studentId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('makeup_credits')
      .insert({ student_id: studentId, total_credits: 1, used_credits: 0, expires_at: expiresAt })
    if (error) return { error: error.message }
  }
  return {}
}

// 欠席 + 振替クレジット加算をまとめて実行
export async function markAbsentWithCredit(
  studentId: string,
  lessonId: string,
  date: string
): Promise<{ error?: string }> {
  const [r1, r2] = await Promise.all([
    recordAttendance(studentId, lessonId, date, 'absent', true),
    addMakeupCredit(studentId),
  ])
  return r1.error ? r1 : r2
}

// 欠席のみ（振替なし）
export async function markAbsentNoCredit(
  studentId: string,
  lessonId: string,
  date: string
): Promise<{ error?: string }> {
  return recordAttendance(studentId, lessonId, date, 'absent', false)
}

// 振替コマを割り当て（クレジットを1消費）
export async function assignMakeup(
  studentId: string,
  lessonId: string,
  assignedDate: string
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: credits } = await supabase
    .from('makeup_credits')
    .select('id, total_credits, used_credits')
    .eq('student_id', studentId)
    .single()

  if (!credits || credits.total_credits - credits.used_credits <= 0) {
    return { error: '振替クレジットが残っていません' }
  }

  const [r1, r2, r3] = await Promise.all([
    supabase.from('makeup_assignments').insert({ student_id: studentId, lesson_id: lessonId, assigned_date: assignedDate }),
    supabase.from('makeup_credits').update({ used_credits: credits.used_credits + 1, updated_at: new Date().toISOString() }).eq('student_id', studentId),
    supabase.from('attendances').upsert(
      { student_id: studentId, lesson_id: lessonId, date: assignedDate, status: 'makeup_used', makeup_credited: false },
      { onConflict: 'student_id,lesson_id,date' }
    ),
  ])

  if (r1.error) return { error: r1.error.message }
  if (r2.error) return { error: r2.error.message }
  if (r3.error) return { error: r3.error.message }
  return {}
}
