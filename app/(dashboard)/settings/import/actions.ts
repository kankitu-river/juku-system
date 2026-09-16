'use server'

import { createClient } from '@/lib/supabase/server'
import { parseRoster } from '@/lib/import/rosterParser'
import { parseIntensiveSchedule } from '@/lib/import/scheduleParser'
import { parseRegularMaster } from '@/lib/import/regularMasterParser'
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
      supabase.from('students').select('name, furigana, display_name'),
    ])
    const teacherNames = new Set((exTeachers ?? []).map((t) => t.name))
    const studentMap = new Map<string, { furigana?: string; display_name?: string }>()
    for (const s of exStudents ?? []) studentMap.set(s.name, {
      furigana: (s as { furigana?: string }).furigana,
      display_name: (s as { display_name?: string }).display_name,
    })

    // 新規講師
    const teacherInserts = teachers
      .filter((t) => !teacherNames.has(t.name))
      .map((t) => ({ name: t.name, subjects: [], grade_levels: [], furigana: '' }))

    // 新規生徒 / ふりがな・生徒表記の補完
    const studentInserts: Record<string, unknown>[] = []
    const furiganaUpdates: { name: string; furigana: string }[] = []
    const displayNameUpdates: { name: string; display_name: string }[] = []
    for (const s of students) {
      const ex = studentMap.get(s.name)
      if (!ex) {
        studentInserts.push({
          name: s.name, grade: s.grade || '未設定', furigana: s.furigana,
          subjects: [], is_trial: s.isTrial, display_name: s.displayName || null,
        })
      } else {
        if (s.furigana && !ex.furigana) furiganaUpdates.push({ name: s.name, furigana: s.furigana })
        if (s.displayName && !ex.display_name) displayNameUpdates.push({ name: s.name, display_name: s.displayName })
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
    for (const u of displayNameUpdates) {
      await supabase.from('students').update({ display_name: u.display_name }).eq('name', u.name)
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
  enrollWarning?: string
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
      // 同一コマ内で同じ生徒が2枠に登場することがある（例: 数 と PS1）。
      // unique(lesson_id, student_id) 制約に触れるため、生徒単位に集約して科目を結合する。
      const perLesson = new Map<string, Set<string>>()
      for (const s of l.students) {
        const sid = smap.get(s.fullName)
        if (!sid) { skippedEnrollments++; continue }
        if (!perLesson.has(sid)) perLesson.set(sid, new Set())
        if (s.subject) perLesson.get(sid)!.add(s.subject)
        if (s.subject) {
          if (!studentSubjectAdd.has(sid)) studentSubjectAdd.set(sid, new Set())
          studentSubjectAdd.get(sid)!.add(s.subject)
        }
      }
      for (const [sid, subs] of perLesson) {
        enrollRows.push({ lesson_id: id, student_id: sid, subject: [...subs].join('・') })
      }
    }

    let insertedLessons = 0
    for (const c of chunk(lessonRows, 300)) {
      const { error } = await supabase.from('lessons').insert(c)
      if (error) return { error: `コマ登録エラー: ${error.message}`, deleted, insertedLessons, insertedEnrollments: 0, skippedEnrollments, updatedStudents: 0 }
      insertedLessons += c.length
    }
    let insertedEnrollments = 0
    let enrollError = ''
    for (const c of chunk(enrollRows, 300)) {
      const { error } = await supabase.from('lesson_enrollments').insert(c)
      if (error) { enrollError = error.message; continue }
      insertedEnrollments += c.length
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
    return {
      deleted, insertedLessons, insertedEnrollments, skippedEnrollments, updatedStudents,
      enrollWarning: enrollError ? `一部の受講登録でエラー: ${enrollError}` : undefined,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '登録に失敗しました', deleted: 0, insertedLessons: 0, insertedEnrollments: 0, skippedEnrollments: 0, updatedStudents: 0 }
  }
}

// ── 新学期の通常授業（マスターExcel）のインポート ──────────────────────────

export interface RegularMatchItem {
  key: string // 生徒表記 or 講師名
  candidates: { id: string; name: string }[]
}

export interface RegularPreview {
  error?: string
  lessonCount: number
  individualCount: number
  groupCount: number
  byDow: Record<number, number>
  totalStudents: number
  matchedStudents: number
  unmatchedTeachers: RegularMatchItem[]
  unmatchedStudents: RegularMatchItem[]
  allTeachers: { id: string; name: string }[]
  allStudents: { id: string; name: string }[]
  existingRegularCount: number
}

async function parseRegularFile(formData: FormData) {
  const file = formData.get('file') as File | null
  if (!file) throw new Error('ファイルが選択されていません')
  const buf = Buffer.from(await file.arrayBuffer())
  return parseRegularMaster(buf)
}

// 生徒表記の先頭の漢字部分を取り出す（候補検索のヒント用）
function kanjiPrefix(s: string): string {
  const m = s.match(/^[一-龯々ノ]+/)
  return m ? m[0] : ''
}

function studentCandidates(displayName: string, students: { id: string; name: string }[]): { id: string; name: string }[] {
  const prefix = kanjiPrefix(displayName)
  if (!prefix) return []
  const nospace = (n: string) => n.replace(/[\s　]/g, '')
  return students
    .filter((s) => nospace(s.name).startsWith(prefix))
    .map((s) => ({ id: s.id, name: s.name }))
}

function teacherCandidates(name: string, teachers: { id: string; name: string }[]): { id: string; name: string }[] {
  const nospace = (n: string) => n.replace(/[\s　]/g, '')
  const key = nospace(name)
  return teachers
    .filter((t) => nospace(t.name).includes(key) || key.includes(nospace(t.name)))
    .map((t) => ({ id: t.id, name: t.name }))
}

export async function previewRegular(formData: FormData): Promise<RegularPreview> {
  const empty = {
    lessonCount: 0, individualCount: 0, groupCount: 0, byDow: {}, totalStudents: 0, matchedStudents: 0,
    unmatchedTeachers: [], unmatchedStudents: [], allTeachers: [], allStudents: [], existingRegularCount: 0,
  }
  try {
    const { lessons } = await parseRegularFile(formData)
    if (lessons.length === 0) throw new Error('取り込むコマがありませんでした（「マスター」シートを確認してください）')
    const supabase = await createClient()
    const [{ data: teachers }, { data: students }, { count: existingRegularCount }] = await Promise.all([
      supabase.from('teachers').select('id, name').order('name'),
      supabase.from('students').select('id, name, display_name').order('name'),
      supabase.from('lessons').select('*', { count: 'exact', head: true }).eq('term_type', 'regular').is('specific_date', null),
    ])
    const tByName = new Map((teachers ?? []).map((t) => [t.name, t.id as string]))
    const sByDisplay = new Map<string, string>()
    for (const s of students ?? []) {
      const dn = (s as { display_name?: string }).display_name
      if (dn) sByDisplay.set(dn, s.id as string)
    }

    let individualCount = 0, groupCount = 0
    const byDow: Record<number, number> = {}
    const unmatchedTeacherNames = new Set<string>()
    const studentSet = new Set<string>()
    const matchedStudentSet = new Set<string>()

    for (const l of lessons) {
      if (l.isGroup) groupCount++; else individualCount++
      byDow[l.dayOfWeek] = (byDow[l.dayOfWeek] ?? 0) + 1
      if (!tByName.has(l.teacherName)) unmatchedTeacherNames.add(l.teacherName)
      for (const s of l.students) {
        studentSet.add(s.displayName)
        if (sByDisplay.has(s.displayName)) matchedStudentSet.add(s.displayName)
      }
    }

    const unmatchedStudentNames = [...studentSet].filter((n) => !sByDisplay.has(n))
    const tList = (teachers ?? []).map((t) => ({ id: t.id as string, name: t.name as string }))
    const sList = (students ?? []).map((s) => ({ id: s.id as string, name: s.name as string }))

    return {
      lessonCount: lessons.length,
      individualCount, groupCount, byDow,
      totalStudents: studentSet.size,
      matchedStudents: matchedStudentSet.size,
      unmatchedTeachers: [...unmatchedTeacherNames].map((name) => ({ key: name, candidates: teacherCandidates(name, tList) })),
      unmatchedStudents: unmatchedStudentNames.map((name) => ({ key: name, candidates: studentCandidates(name, sList) })),
      allTeachers: tList,
      allStudents: sList,
      existingRegularCount: existingRegularCount ?? 0,
    }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : '解析に失敗しました' }
  }
}

export interface RegularResult {
  error?: string
  enrollWarning?: string
  deleted: number
  insertedLessons: number
  insertedEnrollments: number
  skippedEnrollments: number
  unresolvedTeacherLessons: number
  updatedStudents: number
}

// teacherMap: 講師名→teacherId, studentMap: 生徒表記→studentId（未一致をUIで手動解決した分）
export async function commitRegular(
  formData: FormData,
  teacherMap: Record<string, string> = {},
  studentMap: Record<string, string> = {},
): Promise<RegularResult> {
  const fail = (error: string): RegularResult => ({
    error, deleted: 0, insertedLessons: 0, insertedEnrollments: 0, skippedEnrollments: 0, unresolvedTeacherLessons: 0, updatedStudents: 0,
  })
  try {
    const { lessons } = await parseRegularFile(formData)
    if (lessons.length === 0) return fail('取り込むコマがありませんでした')
    const supabase = await createClient()

    const [{ data: teachers }, { data: students }] = await Promise.all([
      supabase.from('teachers').select('id, name'),
      supabase.from('students').select('id, name, display_name, fixed_slots'),
    ])
    const tByName = new Map((teachers ?? []).map((t) => [t.name, t.id as string]))
    const sByDisplay = new Map<string, string>()
    for (const s of students ?? []) {
      const dn = (s as { display_name?: string }).display_name
      if (dn) sByDisplay.set(dn, s.id as string)
    }

    // 手動解決した生徒表記をDBへ保存（次回以降は自動一致する）
    for (const [displayName, studentId] of Object.entries(studentMap)) {
      if (!displayName || !studentId) continue
      await supabase.from('students').update({ display_name: displayName }).eq('id', studentId)
      sByDisplay.set(displayName, studentId)
    }

    const resolveTeacher = (name: string) => tByName.get(name) ?? teacherMap[name] ?? null
    const resolveStudent = (displayName: string) => sByDisplay.get(displayName) ?? studentMap[displayName] ?? null

    // 既存の通常コマ（毎週・繰り返し = term_type regular かつ specific_date なし）を全削除して入れ替え
    const { data: toDelete } = await supabase
      .from('lessons')
      .select('id')
      .eq('term_type', 'regular')
      .is('specific_date', null)
    const delIds = (toDelete ?? []).map((l) => l.id as string)
    let deleted = 0
    for (const c of chunk(delIds, 200)) {
      const { error } = await supabase.from('lessons').delete().in('id', c)
      if (!error) deleted += c.length
    }

    const lessonRows: Record<string, unknown>[] = []
    const enrollRows: Record<string, unknown>[] = []
    let skippedEnrollments = 0
    let unresolvedTeacherLessons = 0

    // 生徒ごとの固定曜日（fixed_slots）を新しいコマから再構築
    type FixedSlot = { day: number; slot: number; subject?: string; teacher_id?: string }
    const fixedByStudent = new Map<string, FixedSlot[]>()

    for (const l of lessons) {
      const id = crypto.randomUUID()
      const teacherId = resolveTeacher(l.teacherName)
      if (!teacherId) unresolvedTeacherLessons++
      lessonRows.push({
        id,
        title: l.subject || (l.isGroup ? '集団' : '個別'),
        type: l.isGroup ? 'group' : 'individual',
        teacher_id: teacherId,
        day_of_week: l.dayOfWeek,
        slot_index: l.slot,
        term_type: 'regular',
        lesson_kind: 'regular',
        specific_date: null,
        subject: l.subject,
        capacity: l.isGroup ? 20 : Math.max(l.students.length, 2),
        is_ps1: false,
        booth_id: null,
      })
      const perLesson = new Map<string, Set<string>>()
      for (const s of l.students) {
        const sid = resolveStudent(s.displayName)
        if (!sid) { skippedEnrollments++; continue }
        if (!perLesson.has(sid)) perLesson.set(sid, new Set())
        if (s.subject) perLesson.get(sid)!.add(s.subject)
      }
      for (const [sid, subs] of perLesson) {
        const subject = [...subs].join('・')
        enrollRows.push({ lesson_id: id, student_id: sid, subject })
        const list = fixedByStudent.get(sid) ?? []
        list.push({ day: l.dayOfWeek, slot: l.slot, subject: subject || undefined, teacher_id: teacherId ?? undefined })
        fixedByStudent.set(sid, list)
      }
    }

    let insertedLessons = 0
    for (const c of chunk(lessonRows, 300)) {
      const { error } = await supabase.from('lessons').insert(c)
      if (error) return { ...fail(`コマ登録エラー: ${error.message}`), deleted }
      insertedLessons += c.length
    }
    let insertedEnrollments = 0
    let enrollError = ''
    for (const c of chunk(enrollRows, 300)) {
      const { error } = await supabase.from('lesson_enrollments').insert(c)
      if (error) { enrollError = error.message; continue }
      insertedEnrollments += c.length
    }

    // 生徒の固定曜日（fixed_slots）を新しい通常コマから再構築（全入れ替えに合わせて同期）
    let updatedStudents = 0
    const sortSlots = (arr: FixedSlot[]) => [...arr].sort((a, b) => a.day - b.day || a.slot - b.slot)
    const norm = (arr: FixedSlot[]) => JSON.stringify(sortSlots(arr))
    for (const s of students ?? []) {
      const sid = s.id as string
      const next = sortSlots(fixedByStudent.get(sid) ?? [])
      const cur = ((s as { fixed_slots?: FixedSlot[] }).fixed_slots ?? []) as FixedSlot[]
      if (norm(cur) === norm(next)) continue
      const { error } = await supabase.from('students').update({ fixed_slots: next }).eq('id', sid)
      if (!error) updatedStudents++
    }

    revalidatePath('/schedule')
    revalidatePath('/students')
    revalidatePath('/shifts')
    return {
      deleted, insertedLessons, insertedEnrollments, skippedEnrollments, unresolvedTeacherLessons,
      updatedStudents,
      enrollWarning: enrollError ? `一部の受講登録でエラー: ${enrollError}` : undefined,
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : '登録に失敗しました')
  }
}
