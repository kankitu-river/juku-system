'use server'

import { createClient } from '@/lib/supabase/server'
import { callML } from '@/lib/ml/client'

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

// 振替クレジットを加算（有効期限付き）
export async function addMakeupCredit(studentId: string, expiresMonths = 3, amount = 1): Promise<{ error?: string }> {
  const supabase = await createClient()

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
      .update({ total_credits: existing.total_credits + amount, expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('student_id', studentId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('makeup_credits')
      .insert({ student_id: studentId, total_credits: amount, used_credits: 0, expires_at: expiresAt })
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

// 振替クレジットを減算（誤って追加した分の取り消し用）
export async function removeMakeupCredit(studentId: string, amount = 1): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('makeup_credits')
    .select('id, total_credits, used_credits')
    .eq('student_id', studentId)
    .single()

  if (!existing) return { error: 'この生徒の振替クレジット記録がありません' }

  const remaining = existing.total_credits - existing.used_credits
  if (remaining < amount) {
    return { error: `未使用の残数（${remaining}件）より多くは減らせません` }
  }

  const { error } = await supabase
    .from('makeup_credits')
    .update({ total_credits: existing.total_credits - amount, updated_at: new Date().toISOString() })
    .eq('student_id', studentId)
  if (error) return { error: error.message }
  return {}
}

// 振替割り当てを取消（クレジットを1件戻し、振替の出欠記録も削除）
export async function cancelMakeupAssignment(assignmentId: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: assignment } = await supabase
    .from('makeup_assignments')
    .select('id, student_id, lesson_id, assigned_date')
    .eq('id', assignmentId)
    .single()

  if (!assignment) return { error: '割り当てが見つかりません' }

  const { error: delError } = await supabase
    .from('makeup_assignments')
    .delete()
    .eq('id', assignmentId)
  if (delError) return { error: delError.message }

  // クレジットを戻す
  const { data: credits } = await supabase
    .from('makeup_credits')
    .select('id, used_credits')
    .eq('student_id', assignment.student_id)
    .single()
  if (credits && credits.used_credits > 0) {
    const { error } = await supabase
      .from('makeup_credits')
      .update({ used_credits: credits.used_credits - 1, updated_at: new Date().toISOString() })
      .eq('student_id', assignment.student_id)
    if (error) return { error: error.message }
  }

  // 振替として作成した出欠記録を削除
  const { error: attError } = await supabase
    .from('attendances')
    .delete()
    .eq('student_id', assignment.student_id)
    .eq('lesson_id', assignment.lesson_id)
    .eq('date', assignment.assigned_date)
    .eq('status', 'makeup_used')
  if (attError) return { error: attError.message }

  return {}
}

// MLサービスで振替候補をスコアリング（B-3）
export async function getMakeupMLScores(
  studentId: string,
  teacherIds: string[]
): Promise<Record<string, { score: number; reasons: string[] }> | null> {
  if (!process.env.ML_API_URL || teacherIds.length === 0) return null

  const supabase = await createClient()

  // 生徒の出欠レコード取得
  const { data: attRows } = await supabase
    .from('attendances')
    .select('status, lesson_id')
    .eq('student_id', studentId)

  const lessonIds = [...new Set((attRows ?? []).map((r) => r.lesson_id as string))]

  // lessonId→teacher_id マッピング
  const lessonTeacherMap: Record<string, string> = {}
  if (lessonIds.length > 0) {
    const { data: lessonRows } = await supabase
      .from('lessons')
      .select('id, teacher_id')
      .in('id', lessonIds)
    for (const l of lessonRows ?? []) {
      if (l.teacher_id) lessonTeacherMap[l.id as string] = l.teacher_id as string
    }
  }

  // 先生ごとに集計
  const stats: Record<string, { total: number; attended: number }> = {}
  for (const row of attRows ?? []) {
    const tid = lessonTeacherMap[row.lesson_id as string]
    if (!tid) continue
    if (!stats[tid]) stats[tid] = { total: 0, attended: 0 }
    stats[tid].total++
    if (row.status === 'present' || row.status === 'makeup_used') stats[tid].attended++
  }

  // 先生の担当コマ数（負荷）
  const { data: loadRows } = await supabase
    .from('lessons')
    .select('teacher_id')
    .not('teacher_id', 'is', null)
  const loadMap: Record<string, number> = {}
  for (const r of loadRows ?? []) {
    const tid = r.teacher_id as string
    loadMap[tid] = (loadMap[tid] ?? 0) + 1
  }

  const candidates = teacherIds.map((tid) => ({
    candidate_id: tid,
    past_lessons: stats[tid]?.total ?? 0,
    attendance_rate: stats[tid]?.total ? stats[tid].attended / stats[tid].total : 0,
    teacher_load: loadMap[tid] ?? 0,
  }))

  const result = await callML<{ ranked: { candidate_id: string; score: number; reasons: string[] }[] }>(
    '/makeup/score',
    { student_id: studentId, candidates }
  )
  if (!result) return null

  const map: Record<string, { score: number; reasons: string[] }> = {}
  for (const r of result.ranked) {
    map[r.candidate_id] = { score: r.score, reasons: r.reasons }
  }
  return map
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
