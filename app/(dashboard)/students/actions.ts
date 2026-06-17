'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { translateSupabaseError } from '@/lib/utils/errors'
import { GRADE_ORDER, getNextGrade } from '@/lib/utils/grade'

export interface StudentFormData {
  name: string
  grade: string
  subjects: string[]
  preferred_teacher_ids: string[]
  ng_teacher_ids: string[]
  fixed_slots: Array<{ day: number; slot: number; subject?: string; teacher_id?: string }>
  lesson_ids: string[]
}

export async function createStudent(data: StudentFormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { lesson_ids, ...studentData } = data
  const { data: created, error } = await supabase.from('students').insert(studentData).select('id').single()
  if (error) return { error: translateSupabaseError(error.message) }
  if (lesson_ids.length > 0) {
    const { error: enrollError } = await supabase.from('lesson_enrollments').insert(
      lesson_ids.map((lid) => ({ lesson_id: lid, student_id: created.id }))
    )
    if (enrollError) return { error: translateSupabaseError(enrollError.message) }
  }
  return {}
}

export async function updateStudent(id: string, data: StudentFormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { lesson_ids, ...studentData } = data
  const { error } = await supabase.from('students').update(studentData).eq('id', id)
  if (error) return { error: translateSupabaseError(error.message) }
  // 受講コマを同期（全削除→再登録）
  await supabase.from('lesson_enrollments').delete().eq('student_id', id)
  if (lesson_ids.length > 0) {
    const { error: enrollError } = await supabase.from('lesson_enrollments').insert(
      lesson_ids.map((lid) => ({ lesson_id: lid, student_id: id }))
    )
    if (enrollError) return { error: translateSupabaseError(enrollError.message) }
  }
  return {}
}

export async function deleteStudent(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('students').delete().eq('id', id)
  if (error) return { error: translateSupabaseError(error.message) }
  return {}
}

export async function importStudents(
  rows: StudentFormData[]
): Promise<{ count?: number; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('students').insert(rows).select('id')
  if (error) return { error: translateSupabaseError(error.message) }
  return { count: data?.length ?? 0 }
}

export interface LessonImportRow {
  name: string
  grade: string
  subject: string
  dayNum: number
  slotNum: number
  teacherId: string
}

export async function importStudentsWithLessons(
  rows: LessonImportRow[]
): Promise<{ studentCount?: number; lessonCount?: number; error?: string }> {
  const supabase = await createClient()

  // 生徒ごとにまとめる
  const studentMap = new Map<string, {
    name: string; grade: string; subjects: string[]
    preferred_teacher_ids: string[]; ng_teacher_ids: string[]
    fixed_slots: Array<{ day: number; slot: number; subject?: string; teacher_id?: string }>
  }>()

  for (const row of rows) {
    const key = `${row.name}__${row.grade}`
    if (!studentMap.has(key)) {
      studentMap.set(key, {
        name: row.name, grade: row.grade, subjects: [],
        preferred_teacher_ids: [], ng_teacher_ids: [], fixed_slots: [],
      })
    }
    const s = studentMap.get(key)!
    if (row.subject && !s.subjects.includes(row.subject)) s.subjects.push(row.subject)
    if (row.dayNum && row.slotNum) {
      const exists = s.fixed_slots.some(fs => fs.day === row.dayNum && fs.slot === row.slotNum)
      if (!exists) s.fixed_slots.push({
        day: row.dayNum, slot: row.slotNum,
        subject: row.subject || undefined,
        teacher_id: row.teacherId || undefined,
      })
    }
  }

  // 生徒を一括登録
  const studentList = Array.from(studentMap.values())
  const { data: createdStudents, error: studentError } = await supabase
    .from('students').insert(studentList).select('id, name, grade')
  if (studentError) return { error: translateSupabaseError(studentError.message) }

  const studentIdMap = new Map<string, string>()
  for (const s of createdStudents ?? []) {
    studentIdMap.set(`${s.name}__${s.grade}`, s.id)
  }

  // コマごとにまとめる（subject + day + slot + teacherId が同じなら同一コマ）
  const lessonMap = new Map<string, {
    subject: string; dayNum: number; slotNum: number; teacherId: string; studentKeys: string[]
  }>()

  for (const row of rows) {
    if (!row.subject || !row.dayNum || !row.slotNum) continue
    const key = `${row.subject}__${row.dayNum}__${row.slotNum}__${row.teacherId}`
    if (!lessonMap.has(key)) {
      lessonMap.set(key, { subject: row.subject, dayNum: row.dayNum, slotNum: row.slotNum, teacherId: row.teacherId, studentKeys: [] })
    }
    const lk = `${row.name}__${row.grade}`
    if (!lessonMap.get(key)!.studentKeys.includes(lk)) lessonMap.get(key)!.studentKeys.push(lk)
  }

  let lessonCount = 0
  const enrollments: { lesson_id: string; student_id: string }[] = []

  for (const [, lesson] of lessonMap) {
    // 同じコマが既に存在するか確認
    let query = supabase.from('lessons').select('id')
      .eq('subject', lesson.subject)
      .eq('day_of_week', lesson.dayNum)
      .eq('slot_index', lesson.slotNum)
      .eq('lesson_kind', 'regular')
      .eq('term_type', 'regular')
    query = lesson.teacherId
      ? query.eq('teacher_id', lesson.teacherId)
      : query.is('teacher_id', null)

    const { data: existing } = await query.limit(1).maybeSingle()

    let lessonId: string
    if (existing) {
      lessonId = existing.id
    } else {
      const { data: created, error: lessonError } = await supabase
        .from('lessons')
        .insert({
          title: lesson.subject,
          type: 'individual',
          lesson_kind: 'regular',
          specific_date: null,
          subject: lesson.subject,
          teacher_id: lesson.teacherId || null,
          day_of_week: lesson.dayNum,
          slot_index: lesson.slotNum,
          term_type: 'regular',
          capacity: lesson.studentKeys.length,
          is_ps1: false,
          notes: null,
        })
        .select('id')
        .single()
      if (lessonError) return { error: translateSupabaseError(lessonError.message) }
      lessonId = created.id
      lessonCount++
    }

    for (const sk of lesson.studentKeys) {
      const studentId = studentIdMap.get(sk)
      if (studentId) enrollments.push({ lesson_id: lessonId, student_id: studentId })
    }
  }

  if (enrollments.length > 0) {
    const { error: enrollError } = await supabase.from('lesson_enrollments').insert(enrollments)
    if (enrollError) return { error: translateSupabaseError(enrollError.message) }
  }

  revalidatePath('/students')
  revalidatePath('/schedule')
  return { studentCount: studentList.length, lessonCount }
}

export async function advanceAllGrades(): Promise<{ count?: number; skipped?: number; error?: string }> {
  const supabase = await createClient()
  const { data: students, error } = await supabase.from('students').select('id, grade')
  if (error) return { error: translateSupabaseError(error.message) }

  let count = 0
  let skipped = 0

  for (const student of students ?? []) {
    const next = getNextGrade(student.grade)
    if (!next) {
      skipped++
      continue
    }
    const { error: updateError } = await supabase
      .from('students')
      .update({ grade: next })
      .eq('id', student.id)
    if (updateError) return { error: translateSupabaseError(updateError.message) }
    count++
  }

  revalidatePath('/students')
  revalidatePath('/')
  return { count, skipped }
}
