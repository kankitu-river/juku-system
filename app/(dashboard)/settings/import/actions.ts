'use server'

import { createClient } from '@/lib/supabase/server'
import { parseRoster } from '@/lib/import/rosterParser'
import { parseIntensiveSchedule } from '@/lib/import/scheduleParser'
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

// ── 夏期講習コマのインポート ──────────────────────────────

export interface SchedulePreview {
  error?: string
  lessonCount: number
  enrollmentCount: number
  groupCount: number
  ps1Count: number
  minDate: string
  maxDate: string
  unmatchedTeachers: string[]
  unmatchedStudents: string[]
}

async function parseScheduleFile(formData: FormData) {
  const file = formData.get('file') as File | null
  if (!file) throw new Error('ファイルが選択されていません')
  const buf = Buffer.from(await file.arrayBuffer())
  return parseIntensiveSchedule(buf)
}

export async function previewSchedule(formData: FormData): Promise<SchedulePreview> {
  try {
    const { lessons, minDate, maxDate } = await parseScheduleFile(formData)
    const supabase = await createClient()
    const [{ data: teachers }, { data: students }] = await Promise.all([
      supabase.from('teachers').select('id, name'),
      supabase.from('students').select('id, name'),
    ])
    const tset = new Set((teachers ?? []).map((t) => t.name))
    const sset = new Set((students ?? []).map((s) => s.name))

    const unmatchedTeachers = new Set<string>()
    const unmatchedStudents = new Set<string>()
    let enrollmentCount = 0, groupCount = 0, ps1Count = 0
    for (const l of lessons) {
      if (!tset.has(l.teacherName)) unmatchedTeachers.add(l.teacherName)
      if (l.isGroup) groupCount++
      if (l.isPs1) ps1Count++
      for (const s of l.students) {
        enrollmentCount++
        if (!sset.has(s.fullName)) unmatchedStudents.add(s.fullName)
      }
    }
    return {
      lessonCount: lessons.length, enrollmentCount, groupCount, ps1Count,
      minDate, maxDate,
      unmatchedTeachers: [...unmatchedTeachers],
      unmatchedStudents: [...unmatchedStudents],
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : '解析に失敗しました',
      lessonCount: 0, enrollmentCount: 0, groupCount: 0, ps1Count: 0,
      minDate: '', maxDate: '', unmatchedTeachers: [], unmatchedStudents: [],
    }
  }
}

export interface ScheduleResult {
  error?: string
  deleted: number
  insertedLessons: number
  insertedEnrollments: number
  skippedEnrollments: number
  updatedStudents: number
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function commitSchedule(formData: FormData): Promise<ScheduleResult> {
  try {
    const { lessons, minDate, maxDate } = await parseScheduleFile(formData)
    if (lessons.length === 0) throw new Error('取り込むコマがありませんでした')
    const supabase = await createClient()

    const [{ data: teachers }, { data: students }] = await Promise.all([
      supabase.from('teachers').select('id, name'),
      supabase.from('students').select('id, name, subjects'),
    ])
    const tmap = new Map((teachers ?? []).map((t) => [t.name, t.id as string]))
    const smap = new Map((students ?? []).map((s) => [s.name, s.id as string]))
    const existingSubjects = new Map<string, string[]>()
    for (const s of students ?? []) existingSubjects.set(s.id as string, (s.subjects as string[] | null) ?? [])

    // 既存の講習コマ（期間内・臨時）を削除して入れ替え（冪等）
    const { data: toDelete } = await supabase
      .from('lessons')
      .select('id')
      .eq('term_type', 'intensive')
      .eq('lesson_kind', 'temporary')
      .gte('specific_date', minDate)
      .lte('specific_date', maxDate)
    const delIds = (toDelete ?? []).map((l) => l.id as string)
    let deleted = 0
    for (const c of chunk(delIds, 200)) {
      const { error } = await supabase.from('lessons').delete().in('id', c)
      if (!error) deleted += c.length
    }

    // レッスン行 + エンロール行を構築（lesson.id はクライアント生成UUID）
    const lessonRows: Record<string, unknown>[] = []
    const enrollRows: Record<string, unknown>[] = []
    const studentSubjectAdd = new Map<string, Set<string>>()
    let skippedEnrollments = 0

    for (const l of lessons) {
      const id = crypto.randomUUID()
      const dow = new Date(l.date + 'T12:00:00').getDay()
      lessonRows.push({
        id,
        title: l.subject || (l.isGroup ? '集団' : '個別'),
        type: l.isGroup ? 'group' : 'individual',
        teacher_id: tmap.get(l.teacherName) ?? null,
        day_of_week: dow,
        slot_index: l.slot,
        term_type: 'intensive',
        lesson_kind: 'temporary',
        specific_date: l.date,
        subject: l.subject,
        capacity: Math.max(l.students.length, l.isGroup ? 10 : 2),
        is_ps1: l.isPs1,
        booth_id: null,
      })
      for (const s of l.students) {
        const sid = smap.get(s.fullName)
        if (!sid) { skippedEnrollments++; continue }
        enrollRows.push({ lesson_id: id, student_id: sid, subject: s.subject })
        if (s.subject) {
          if (!studentSubjectAdd.has(sid)) studentSubjectAdd.set(sid, new Set())
          studentSubjectAdd.get(sid)!.add(s.subject)
        }
      }
    }

    let insertedLessons = 0
    for (const c of chunk(lessonRows, 300)) {
      const { error } = await supabase.from('lessons').insert(c)
      if (error) return { error: `コマ登録エラー: ${error.message}`, deleted, insertedLessons, insertedEnrollments: 0, skippedEnrollments, updatedStudents: 0 }
      insertedLessons += c.length
    }
    let insertedEnrollments = 0
    for (const c of chunk(enrollRows, 300)) {
      const { error } = await supabase.from('lesson_enrollments').insert(c)
      if (!error) insertedEnrollments += c.length
    }

    // 生徒の受講科目を補完（既存との和集合）
    let updatedStudents = 0
    for (const [sid, subs] of studentSubjectAdd) {
      const cur = existingSubjects.get(sid) ?? []
      const merged = [...new Set([...cur, ...subs])].filter(Boolean)
      if (merged.length !== cur.length) {
        const { error } = await supabase.from('students').update({ subjects: merged }).eq('id', sid)
        if (!error) updatedStudents++
      }
    }

    revalidatePath('/schedule')
    revalidatePath('/students')
    return { deleted, insertedLessons, insertedEnrollments, skippedEnrollments, updatedStudents }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '登録に失敗しました', deleted: 0, insertedLessons: 0, insertedEnrollments: 0, skippedEnrollments: 0, updatedStudents: 0 }
  }
}
