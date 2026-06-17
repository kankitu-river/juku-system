'use server'

import { createClient } from '@/lib/supabase/server'
import type { SubjectGrade } from '@/types'

export interface TeacherFormData {
  name: string
  email: string
  role: 'admin' | 'staff'
  subject_grades: SubjectGrade[]
}

function normalizeEmail(email: string): string | null {
  const trimmed = email.trim()
  return trimmed === '' ? null : trimmed
}

function deriveFields(subject_grades: SubjectGrade[]) {
  const subjects = subject_grades.map((sg) => sg.subject)
  const grade_levels = [...new Set(subject_grades.flatMap((sg) => sg.grades))]
  return { subjects, grade_levels }
}

export async function createTeacher(data: TeacherFormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('teachers').insert({
    ...data,
    email: normalizeEmail(data.email),
    ...deriveFields(data.subject_grades),
  })
  if (error) return { error: error.message }
  return {}
}

export async function updateTeacher(id: string, data: TeacherFormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('teachers').update({
    ...data,
    email: normalizeEmail(data.email),
    ...deriveFields(data.subject_grades),
  }).eq('id', id)
  if (error) return { error: error.message }
  return {}
}

export async function deleteTeacher(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('teachers').delete().eq('id', id)
  if (error) return { error: error.message }
  return {}
}

export interface TeacherImportRow {
  name: string
  email: string | null
  role: 'admin' | 'staff'
  subject_grades: SubjectGrade[]
  subjects: string[]
  grade_levels: string[]
}

export async function importTeachers(
  rows: TeacherImportRow[]
): Promise<{ count?: number; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('teachers').insert(rows).select('id')
  if (error) return { error: error.message }
  return { count: data?.length ?? 0 }
}
