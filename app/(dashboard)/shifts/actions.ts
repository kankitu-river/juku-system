'use server'

import { createClient } from '@/lib/supabase/server'

export interface ShiftFormData {
  teacher_id: string
  date: string
  start_time: string
  end_time: string
}

export async function upsertShift(data: ShiftFormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('shifts')
    .upsert(data, { onConflict: 'teacher_id,date' })
  if (error) return { error: error.message }
  return {}
}

export async function deleteShift(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('shifts').delete().eq('id', id)
  if (error) return { error: error.message }
  return {}
}

export interface ShiftImpact {
  affectedStudents: { id: string; name: string; grade: string; hasPendingCredits: boolean }[]
  lessonCount: number
}

export async function getShiftImpact(teacherId: string, date: string): Promise<ShiftImpact> {
  const supabase = await createClient()
  const dow = new Date(date + 'T12:00:00').getDay()

  const [{ data: regularLessons }, { data: tempLessons }, { data: makeupCredits }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, enrollments:lesson_enrollments(student_id, student:students(id, name, grade))')
      .eq('teacher_id', teacherId)
      .eq('day_of_week', dow)
      .eq('lesson_kind', 'regular'),
    supabase
      .from('lessons')
      .select('id, enrollments:lesson_enrollments(student_id, student:students(id, name, grade))')
      .eq('teacher_id', teacherId)
      .eq('specific_date', date)
      .eq('lesson_kind', 'temporary'),
    supabase.from('makeup_credits').select('student_id, total_credits, used_credits'),
  ])

  const creditsMap = new Map(
    (makeupCredits ?? []).map((mc) => [mc.student_id as string, (mc.total_credits as number) - (mc.used_credits as number)])
  )

  const allLessons = [...(regularLessons ?? []), ...(tempLessons ?? [])]
  const studentMap = new Map<string, { id: string; name: string; grade: string }>()
  for (const lesson of allLessons) {
    for (const e of (lesson.enrollments ?? []) as unknown as { student_id: string; student: { id: string; name: string; grade: string } | null }[]) {
      if (e.student && !studentMap.has(e.student.id)) studentMap.set(e.student.id, e.student)
    }
  }

  return {
    affectedStudents: Array.from(studentMap.values()).map((s) => ({
      ...s,
      hasPendingCredits: (creditsMap.get(s.id) ?? 0) > 0,
    })),
    lessonCount: allLessons.length,
  }
}

export async function copyShiftsToNextWeek(currentWeekDates: string[]): Promise<{ count?: number; error?: string }> {
  const supabase = await createClient()
  const { data: shifts, error: fetchError } = await supabase
    .from('shifts')
    .select('teacher_id, start_time, end_time, date')
    .in('date', currentWeekDates)
  if (fetchError) return { error: fetchError.message }
  if (!shifts?.length) return { count: 0 }

  const nextWeekShifts = shifts.map((shift) => {
    const d = new Date(shift.date)
    d.setDate(d.getDate() + 7)
    return {
      teacher_id: shift.teacher_id,
      date: d.toISOString().split('T')[0],
      start_time: shift.start_time,
      end_time: shift.end_time,
    }
  })
  const { error: insertError } = await supabase
    .from('shifts')
    .upsert(nextWeekShifts, { onConflict: 'teacher_id,date' })
  if (insertError) return { error: insertError.message }
  return { count: nextWeekShifts.length }
}
