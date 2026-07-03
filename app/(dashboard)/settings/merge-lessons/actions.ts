'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface LessonInGroup {
  id: string
  subject: string
  capacity: number
  enrollmentCount: number
}

export interface DuplicateGroup {
  teacherId: string
  teacherName: string
  dayOfWeek: number
  slotIndex: number
  termType: string
  lessons: LessonInGroup[]
}

export async function getDuplicateGroups(): Promise<{ groups: DuplicateGroup[]; error?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('lessons')
    .select(`
      id, subject, teacher_id, day_of_week, slot_index, term_type, capacity, created_at,
      teacher:teachers(id, name),
      enrollments:lesson_enrollments(id)
    `)
    .eq('lesson_kind', 'regular')
    .not('teacher_id', 'is', null)
    .order('created_at')

  if (error) return { groups: [], error: error.message }

  const map = new Map<string, NonNullable<typeof data>>()
  for (const lesson of data ?? []) {
    const key = `${lesson.teacher_id}-${lesson.day_of_week}-${lesson.slot_index}-${lesson.term_type}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(lesson)
  }

  const groups: DuplicateGroup[] = []
  for (const group of map.values()) {
    if (group.length <= 1) continue
    const t = group[0].teacher as unknown as { id: string; name: string } | null
    groups.push({
      teacherId: group[0].teacher_id!,
      teacherName: t?.name ?? '不明',
      dayOfWeek: group[0].day_of_week,
      slotIndex: group[0].slot_index,
      termType: group[0].term_type,
      lessons: group.map(l => ({
        id: l.id,
        subject: l.subject,
        capacity: l.capacity,
        enrollmentCount: Array.isArray(l.enrollments) ? l.enrollments.length : 0,
      })),
    })
  }

  return { groups }
}

export async function executeMerge(): Promise<{ mergedLessons: number; movedEnrollments: number; error?: string }> {
  const supabase = await createClient()

  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('id, subject, teacher_id, day_of_week, slot_index, term_type, capacity, created_at')
    .eq('lesson_kind', 'regular')
    .not('teacher_id', 'is', null)
    .order('created_at')

  if (error) return { mergedLessons: 0, movedEnrollments: 0, error: error.message }

  const map = new Map<string, NonNullable<typeof lessons>>()
  for (const lesson of lessons ?? []) {
    const key = `${lesson.teacher_id}-${lesson.day_of_week}-${lesson.slot_index}-${lesson.term_type}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(lesson)
  }

  let mergedLessons = 0
  let movedEnrollments = 0

  for (const group of map.values()) {
    if (group.length <= 1) continue

    const primary = group[0]
    const secondaries = group.slice(1)
    const maxCapacity = Math.max(...group.map(l => l.capacity))

    await supabase.from('lessons').update({ capacity: maxCapacity }).eq('id', primary.id)

    for (const secondary of secondaries) {
      const { data: enrollments } = await supabase
        .from('lesson_enrollments')
        .select('id, student_id, subject')
        .eq('lesson_id', secondary.id)

      for (const enrollment of enrollments ?? []) {
        const subject = enrollment.subject || secondary.subject || null

        const { data: existing } = await supabase
          .from('lesson_enrollments')
          .select('id, subject')
          .eq('lesson_id', primary.id)
          .eq('student_id', enrollment.student_id)
          .maybeSingle()

        if (!existing) {
          await supabase.from('lesson_enrollments').insert({
            lesson_id: primary.id,
            student_id: enrollment.student_id,
            subject,
          })
          movedEnrollments++
        } else if (!existing.subject && subject) {
          await supabase.from('lesson_enrollments').update({ subject }).eq('id', existing.id)
        }
      }

      await supabase.from('lessons').delete().eq('id', secondary.id)
      mergedLessons++
    }
  }

  revalidatePath('/schedule')
  revalidatePath('/shifts')
  return { mergedLessons, movedEnrollments }
}
