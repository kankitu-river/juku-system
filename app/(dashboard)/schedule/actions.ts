'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { LessonFormData } from '@/components/schedule/LessonForm'

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

export async function createLesson(data: LessonFormData): Promise<{ error?: string }> {
  const supabase = await createClient()

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
  return {}
}

export async function updateLesson(
  id: string,
  data: LessonFormData
): Promise<{ error?: string }> {
  const supabase = await createClient()

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
  return {}
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

export async function deleteLesson(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('lessons').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedule')
  return {}
}
