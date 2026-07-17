'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { LessonFormData } from '@/components/schedule/LessonForm'
import { validateLessonConflicts, checkPairingRules } from '@/lib/utils/scheduleValidation'
import { snapshotLesson, recordAudit } from '@/lib/audit/recorder'

type SaveResult = { error?: string; boothWarning?: string; auditLogId?: string }

const DAY_NAMES: Record<number, string> = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土', 0: '日', 7: '日' }

function lessonSummary(
  subject: string | null | undefined,
  dayOfWeek: number,
  slotIndex: number,
  action: string
): string {
  const sub = subject || '(無題)'
  const day = DAY_NAMES[dayOfWeek] ?? ''
  return `${sub} ${day}曜 第${slotIndex}コマ を${action}`
}

export async function enrollStudent(lessonId: string, studentId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lesson_enrollments')
    .insert({ lesson_id: lessonId, student_id: studentId })
  if (error) return { error: error.message }
  return {}
}

export async function unenrollStudent(lessonId: string, studentId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lesson_enrollments')
    .delete()
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId)
  if (error) return { error: error.message }
  return {}
}

export async function createLesson(data: LessonFormData): Promise<SaveResult> {
  const supabase = await createClient()

  if (!data.bypassBoothWarning) {
    const conflicts = await validateLessonConflicts(supabase, {
      lesson_kind: data.lesson_kind,
      day_of_week: data.day_of_week,
      slot_index: data.slot_index,
      term_type: data.term_type,
      specific_date: data.specific_date || null,
      teacher_id: data.teacher_id || null,
      booth_id: data.booth_id || null,
      student_ids: data.student_ids,
    })
    const errors = conflicts.filter((c) => c.severity === 'error')
    if (errors.length > 0) return { error: errors.map((c) => c.message).join('\n') }
    const warnings = conflicts.filter((c) => c.severity === 'warning')
    if (warnings.length > 0) return { boothWarning: warnings.map((c) => c.message).join('\n') }
  }

  if (data.student_ids.length >= 2) {
    const pairingViolations = await checkPairingRules(supabase, '', data.student_ids)
    const blockers = pairingViolations.filter((v) => v.severity === 'block')
    if (blockers.length > 0) return { error: blockers.map((v) => v.label).join('\n') }
    const warns = pairingViolations.filter((v) => v.severity === 'warn')
    if (warns.length > 0) return { boothWarning: warns.map((v) => v.label).join('\n') }
  }

  const { data: lesson, error } = await supabase
    .from('lessons')
    .insert({
      title: data.subject || '',
      type: data.type,
      lesson_kind: data.lesson_kind,
      specific_date: data.lesson_kind === 'temporary' ? data.specific_date : null,
      subject: data.subject || null,
      teacher_id: data.teacher_id || null,
      day_of_week: data.day_of_week,
      slot_index: data.slot_index,
      term_type: data.term_type,
      booth_id: data.booth_id || null,
      capacity: data.capacity,
      is_ps1: data.is_ps1 ?? false,
      notes: data.notes || null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (data.student_ids.length > 0) {
    const enrollments = data.student_ids.map((sid) => ({
      lesson_id: lesson.id,
      student_id: sid,
      subject: data.student_subjects?.[sid] || data.subject || null,
    }))
    const { error: enrollError } = await supabase.from('lesson_enrollments').insert(enrollments)
    if (enrollError) return { error: enrollError.message }
  }

  revalidatePath('/schedule')

  try {
    const afterSnapshot = await snapshotLesson(supabase, lesson.id)
    const auditLogId = await recordAudit(supabase, {
      recordId: lesson.id,
      action: 'create',
      before: null,
      after: afterSnapshot,
      summary: lessonSummary(data.subject, data.day_of_week, data.slot_index, '作成'),
    })
    return { auditLogId: auditLogId ?? undefined }
  } catch (e) {
    console.error('Audit recording failed', e)
    return {}
  }
}

export async function updateLesson(
  id: string,
  data: LessonFormData
): Promise<SaveResult> {
  const supabase = await createClient()

  if (!data.bypassBoothWarning) {
    const conflicts = await validateLessonConflicts(
      supabase,
      {
        lesson_kind: data.lesson_kind,
        day_of_week: data.day_of_week,
        slot_index: data.slot_index,
        term_type: data.term_type,
        specific_date: data.specific_date || null,
        teacher_id: data.teacher_id || null,
        booth_id: data.booth_id || null,
        student_ids: data.student_ids,
      },
      id
    )
    const errors = conflicts.filter((c) => c.severity === 'error')
    if (errors.length > 0) return { error: errors.map((c) => c.message).join('\n') }
    const warnings = conflicts.filter((c) => c.severity === 'warning')
    if (warnings.length > 0) return { boothWarning: warnings.map((c) => c.message).join('\n') }
  }

  if (data.student_ids.length >= 2) {
    const pairingViolations = await checkPairingRules(supabase, id, data.student_ids)
    const blockers = pairingViolations.filter((v) => v.severity === 'block')
    if (blockers.length > 0) return { error: blockers.map((v) => v.label).join('\n') }
    const warns = pairingViolations.filter((v) => v.severity === 'warn')
    if (warns.length > 0) return { boothWarning: warns.map((v) => v.label).join('\n') }
  }

  // 更新前スナップショットを取得（更新適用前）
  let beforeSnapshot = null
  try {
    beforeSnapshot = await snapshotLesson(supabase, id)
  } catch (e) {
    console.error('Pre-snapshot failed', e)
  }

  const { error } = await supabase
    .from('lessons')
    .update({
      title: data.subject || '',
      type: data.type,
      lesson_kind: data.lesson_kind,
      specific_date: data.lesson_kind === 'temporary' ? data.specific_date : null,
      subject: data.subject || null,
      teacher_id: data.teacher_id || null,
      day_of_week: data.day_of_week,
      slot_index: data.slot_index,
      term_type: data.term_type,
      booth_id: data.booth_id || null,
      capacity: data.capacity,
      is_ps1: data.is_ps1 ?? false,
      notes: data.notes || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  // 受講生徒を同期（全削除→再登録）
  await supabase.from('lesson_enrollments').delete().eq('lesson_id', id)
  if (data.student_ids.length > 0) {
    const enrollments = data.student_ids.map((sid) => ({
      lesson_id: id,
      student_id: sid,
      subject: data.student_subjects?.[sid] || data.subject || null,
    }))
    const { error: enrollError } = await supabase.from('lesson_enrollments').insert(enrollments)
    if (enrollError) return { error: enrollError.message }
  }

  revalidatePath('/schedule')

  try {
    const afterSnapshot = await snapshotLesson(supabase, id)
    const auditLogId = await recordAudit(supabase, {
      recordId: id,
      action: 'update',
      before: beforeSnapshot,
      after: afterSnapshot,
      summary: lessonSummary(data.subject, data.day_of_week, data.slot_index, '更新'),
    })
    return { auditLogId: auditLogId ?? undefined }
  } catch (e) {
    console.error('Audit recording failed', e)
    return {}
  }
}

export async function createRepeatingLessons(
  data: LessonFormData,
  repeatUntil: string
): Promise<{ count?: number; error?: string }> {
  const supabase = await createClient()

  const startDate = new Date(data.specific_date)
  const endDate = new Date(repeatUntil)
  if (endDate <= startDate) return { error: '終了日は開始日より後にしてください' }

  const dates: string[] = []
  const cur = new Date(startDate)
  while (cur <= endDate) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 7)
  }

  const dow = startDate.getDay() === 0 ? 7 : startDate.getDay()
  const records = dates.map((d) => ({
    title: data.subject,
    type: data.type,
    lesson_kind: 'temporary' as const,
    specific_date: d,
    subject: data.subject,
    teacher_id: data.teacher_id || null,
    day_of_week: dow,
    slot_index: data.slot_index,
    term_type: data.term_type,
    booth_id: data.booth_id || null,
    capacity: data.capacity,
    notes: data.notes || null,
  }))

  const { data: created, error } = await supabase.from('lessons').insert(records).select('id')
  if (error) return { error: error.message }

  if (data.student_ids.length > 0) {
    const enrollments = (created ?? []).flatMap((l) =>
      data.student_ids.map((sid) => ({ lesson_id: l.id, student_id: sid }))
    )
    await supabase.from('lesson_enrollments').insert(enrollments)
  }

  revalidatePath('/schedule')
  return { count: created?.length ?? 0 }
}

export async function deleteLesson(id: string): Promise<{ error?: string; auditLogId?: string }> {
  const supabase = await createClient()

  let beforeSnapshot = null
  try {
    beforeSnapshot = await snapshotLesson(supabase, id)
  } catch (e) {
    console.error('Pre-snapshot failed', e)
  }

  const { error } = await supabase.from('lessons').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/schedule')

  try {
    const lesson = beforeSnapshot?.lesson
    const summary = lesson
      ? lessonSummary(
          lesson.subject as string | null,
          lesson.day_of_week as number,
          lesson.slot_index as number,
          '削除'
        )
      : '削除'
    const auditLogId = await recordAudit(supabase, {
      recordId: id,
      action: 'delete',
      before: beforeSnapshot,
      after: null,
      summary,
    })
    return { auditLogId: auditLogId ?? undefined }
  } catch (e) {
    console.error('Audit recording failed', e)
    return {}
  }
}

export interface LessonImpact {
  affectedStudents: { id: string; name: string; grade: string; hasPendingCredits: boolean }[]
  lessonInfo: { subject: string | null; dayOfWeek: number; slotIndex: number } | null
}

export async function getLessonImpact(lessonId: string): Promise<LessonImpact> {
  const supabase = await createClient()

  const [{ data: lesson }, { data: enrollments }, { data: makeupCredits }] = await Promise.all([
    supabase.from('lessons').select('subject, day_of_week, slot_index').eq('id', lessonId).single(),
    supabase
      .from('lesson_enrollments')
      .select('student_id, student:students(id, name, grade)')
      .eq('lesson_id', lessonId),
    supabase.from('makeup_credits').select('student_id, total_credits, used_credits'),
  ])

  const students = (enrollments ?? []).map((e) => {
    const s = e.student as unknown as { id: string; name: string; grade: string } | null
    return s ? { id: s.id, name: s.name, grade: s.grade } : null
  }).filter(Boolean) as { id: string; name: string; grade: string }[]

  const creditsMap = new Map(
    (makeupCredits ?? []).map((mc) => [mc.student_id as string, (mc.total_credits as number) - (mc.used_credits as number)])
  )

  return {
    affectedStudents: students.map((s) => ({
      ...s,
      hasPendingCredits: (creditsMap.get(s.id) ?? 0) > 0,
    })),
    lessonInfo: lesson
      ? { subject: lesson.subject as string | null, dayOfWeek: lesson.day_of_week as number, slotIndex: lesson.slot_index as number }
      : null,
  }
}
