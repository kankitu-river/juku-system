'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateSchedule, type DraftScheduleResult, type AvailabilityMap } from '@/lib/utils/intensiveScheduler'

export async function upsertIntensivePlan(
  studentId: string,
  termPeriodId: string,
  subject: string,
  plannedCount: number
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('intensive_plans')
    .upsert(
      { student_id: studentId, term_period_id: termPeriodId, subject, planned_count: plannedCount },
      { onConflict: 'student_id,term_period_id,subject' }
    )
  if (error) return { error: error.message }
  revalidatePath('/schedule/intensive')
  return {}
}

export async function deleteIntensivePlan(
  studentId: string,
  termPeriodId: string,
  subject: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('intensive_plans')
    .delete()
    .eq('student_id', studentId)
    .eq('term_period_id', termPeriodId)
    .eq('subject', subject)
  if (error) return { error: error.message }
  revalidatePath('/schedule/intensive')
  return {}
}

export async function enrollIntensiveLesson(
  studentId: string,
  lessonId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lesson_enrollments')
    .insert({ student_id: studentId, lesson_id: lessonId })
  if (error) return { error: error.message }
  revalidatePath('/schedule/intensive')
  revalidatePath('/schedule')
  return {}
}

export async function unenrollIntensiveLesson(
  studentId: string,
  lessonId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lesson_enrollments')
    .delete()
    .eq('student_id', studentId)
    .eq('lesson_id', lessonId)
  if (error) return { error: error.message }
  revalidatePath('/schedule/intensive')
  revalidatePath('/schedule')
  return {}
}

export async function generateDraftSchedule(
  termPeriodId: string
): Promise<{ result?: DraftScheduleResult; error?: string }> {
  const supabase = await createClient()

  const [
    { data: students },
    { data: lessons },
    { data: plans },
    { data: currentEnrollments },
    { data: availabilityRows },
    { data: regularEnrollments },
  ] = await Promise.all([
    supabase.from('students').select('id, name, grade, preferred_teacher_ids, ng_teacher_ids'),
    supabase
      .from('lessons')
      .select('id, subject, teacher_id, teacher:teachers(id, name), day_of_week, slot_index, specific_date, capacity, term_type, enrollments:lesson_enrollments(student_id)')
      .eq('term_type', 'intensive'),
    supabase.from('intensive_plans').select('*').eq('term_period_id', termPeriodId),
    supabase.from('lesson_enrollments').select('student_id, lesson_id'),
    supabase.from('intensive_student_availability').select('student_id, date, slot_index').eq('term_period_id', termPeriodId),
    supabase
      .from('lesson_enrollments')
      .select('student_id, lesson:lessons(subject, teacher_id, term_type)')
      .not('lesson', 'is', null),
  ])

  if (!students || !lessons || !plans) return { error: 'データ取得に失敗しました' }

  // regularTeacherMap: student_id -> subject -> teacher_id (出現数が最多の先生)
  const teacherCountMap: Record<string, Record<string, Record<string, number>>> = {}
  for (const row of (regularEnrollments ?? []) as any[]) {
    const lesson = row.lesson as { subject: string; teacher_id: string | null; term_type: string } | null
    if (!lesson || lesson.term_type !== 'regular' || !lesson.teacher_id) continue
    const sid = row.student_id as string
    if (!teacherCountMap[sid]) teacherCountMap[sid] = {}
    if (!teacherCountMap[sid][lesson.subject]) teacherCountMap[sid][lesson.subject] = {}
    teacherCountMap[sid][lesson.subject][lesson.teacher_id] =
      (teacherCountMap[sid][lesson.subject][lesson.teacher_id] ?? 0) + 1
  }

  const regularTeacherMap: Record<string, Record<string, string>> = {}
  for (const [sid, subjectMap] of Object.entries(teacherCountMap)) {
    regularTeacherMap[sid] = {}
    for (const [subject, countMap] of Object.entries(subjectMap)) {
      const best = Object.entries(countMap).sort((a, b) => b[1] - a[1])[0]
      if (best) regularTeacherMap[sid][subject] = best[0]
    }
  }

  // availabilityMap: student_id -> Set<"date__slotIndex">
  const availabilityMap: AvailabilityMap = {}
  for (const row of (availabilityRows ?? []) as { student_id: string; date: string; slot_index: number }[]) {
    if (!availabilityMap[row.student_id]) availabilityMap[row.student_id] = new Set()
    availabilityMap[row.student_id].add(`${row.date}__${row.slot_index}`)
  }

  const lessonInfos = (lessons as any[]).map((l) => ({
    id: l.id,
    subject: l.subject,
    teacher_id: l.teacher_id ?? null,
    teacher_name: (l.teacher as any)?.name ?? null,
    day_of_week: l.day_of_week,
    slot_index: l.slot_index,
    specific_date: l.specific_date ?? null,
    capacity: l.capacity,
    enrolled_count: ((l.enrollments as any[]) ?? []).length,
  }))

  const result = generateSchedule(
    (students as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      grade: s.grade,
      preferred_teacher_ids: s.preferred_teacher_ids ?? [],
      ng_teacher_ids: s.ng_teacher_ids ?? [],
    })),
    lessonInfos,
    (plans as any[]).map((p) => ({
      student_id: p.student_id,
      subject: p.subject,
      planned_count: p.planned_count,
    })),
    (currentEnrollments as any[] ?? []).map((e) => ({
      student_id: e.student_id,
      lesson_id: e.lesson_id,
    })),
    regularTeacherMap,
    availabilityMap,
  )

  return { result }
}

export async function applyDraftSchedule(
  enrollments: { studentId: string; lessonId: string }[]
): Promise<{ count: number; error?: string }> {
  if (enrollments.length === 0) return { count: 0 }
  const supabase = await createClient()
  const rows = enrollments.map((e) => ({ student_id: e.studentId, lesson_id: e.lessonId }))
  const { error } = await supabase
    .from('lesson_enrollments')
    .upsert(rows, { onConflict: 'student_id,lesson_id', ignoreDuplicates: true })
  if (error) return { count: 0, error: error.message }
  revalidatePath('/schedule/intensive')
  revalidatePath('/schedule')
  return { count: enrollments.length }
}
