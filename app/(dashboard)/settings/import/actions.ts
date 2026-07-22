'use server'

import { createClient } from '@/lib/supabase/server'
import { parseRoster } from '@/lib/import/rosterParser'
import { revalidatePath } from 'next/cache'

export interface ImportPreview {
  error?: string
  newTeachers: { name: string }[]
  newStudents: { name: string; grade: string; furigana: string; isTrial: boolean }[]
  furiganaUpdates: { name: string; furigana: string }[]
  totalTeachers: number
  totalStudents: number
}

async function parseFormFile(formData: FormData) {
  const file = formData.get('file') as File | null
  if (!file) throw new Error('ファイルが選択されていません')
  const buf = Buffer.from(await file.arrayBuffer())
  return parseRoster(buf)
}

export async function previewImport(formData: FormData): Promise<ImportPreview> {
  try {
    const { teachers, students } = await parseFormFile(formData)
    const supabase = await createClient()

    const [{ data: exTeachers }, { data: exStudents }] = await Promise.all([
      supabase.from('teachers').select('name'),
      supabase.from('students').select('name, furigana'),
    ])

    const teacherNames = new Set((exTeachers ?? []).map((t) => t.name))
    const studentMap = new Map<string, { furigana?: string }>()
    for (const s of exStudents ?? []) studentMap.set(s.name, { furigana: (s as { furigana?: string }).furigana })

    const newTeachers = teachers.filter((t) => !teacherNames.has(t.name)).map((t) => ({ name: t.name }))

    const newStudents: ImportPreview['newStudents'] = []
    const furiganaUpdates: ImportPreview['furiganaUpdates'] = []
    for (const s of students) {
      const ex = studentMap.get(s.name)
      if (!ex) {
        newStudents.push({ name: s.name, grade: s.grade, furigana: s.furigana, isTrial: s.isTrial })
      } else if (s.furigana && !ex.furigana) {
        furiganaUpdates.push({ name: s.name, furigana: s.furigana })
      }
    }

    return {
      newTeachers, newStudents, furiganaUpdates,
      totalTeachers: teachers.length, totalStudents: students.length,
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : '解析に失敗しました',
      newTeachers: [], newStudents: [], furiganaUpdates: [], totalTeachers: 0, totalStudents: 0,
    }
  }
}

export interface ImportResult {
  error?: string
  addedTeachers: number
  addedStudents: number
  updatedFurigana: number
}

export async function commitImport(formData: FormData): Promise<ImportResult> {
  try {
    const { teachers, students } = await parseFormFile(formData)
    const supabase = await createClient()

    const [{ data: exTeachers }, { data: exStudents }] = await Promise.all([
      supabase.from('teachers').select('name'),
      supabase.from('students').select('name, furigana'),
    ])
    const teacherNames = new Set((exTeachers ?? []).map((t) => t.name))
    const studentMap = new Map<string, { furigana?: string }>()
    for (const s of exStudents ?? []) studentMap.set(s.name, { furigana: (s as { furigana?: string }).furigana })

    // 新規講師
    const teacherInserts = teachers
      .filter((t) => !teacherNames.has(t.name))
      .map((t) => ({ name: t.name, subjects: [], grade_levels: [], furigana: '' }))

    // 新規生徒 / ふりがな補完
    const studentInserts: Record<string, unknown>[] = []
    const furiganaUpdates: { name: string; furigana: string }[] = []
    for (const s of students) {
      const ex = studentMap.get(s.name)
      if (!ex) {
        studentInserts.push({
          name: s.name, grade: s.grade || '未設定', furigana: s.furigana,
          subjects: [], is_trial: s.isTrial,
        })
      } else if (s.furigana && !ex.furigana) {
        furiganaUpdates.push({ name: s.name, furigana: s.furigana })
      }
    }

    let addedTeachers = 0, addedStudents = 0, updatedFurigana = 0

    if (teacherInserts.length > 0) {
      const { error } = await supabase.from('teachers').insert(teacherInserts)
      if (error) return failIfColumn(error.message)
      addedTeachers = teacherInserts.length
    }
    if (studentInserts.length > 0) {
      const { error } = await supabase.from('students').insert(studentInserts)
      if (error) return failIfColumn(error.message)
      addedStudents = studentInserts.length
    }
    for (const u of furiganaUpdates) {
      const { error } = await supabase.from('students').update({ furigana: u.furigana }).eq('name', u.name)
      if (!error) updatedFurigana++
    }

    revalidatePath('/students')
    revalidatePath('/teachers')
    return { addedTeachers, addedStudents, updatedFurigana }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '登録に失敗しました', addedTeachers: 0, addedStudents: 0, updatedFurigana: 0 }
  }
}

function failIfColumn(msg: string): ImportResult {
  const hint = msg.includes('furigana')
    ? 'ふりがな列が未作成です。Supabaseで migration 030_student_furigana.sql を実行してください。'
    : msg
  return { error: hint, addedTeachers: 0, addedStudents: 0, updatedFurigana: 0 }
}
