import type { SupabaseClient } from '@supabase/supabase-js'

export interface LessonConflict {
  type: 'teacher' | 'student' | 'booth'
  severity: 'error' | 'warning'
  message: string
}

export interface LessonValidationInput {
  lesson_kind: 'regular' | 'temporary'
  day_of_week: number
  slot_index: number
  term_type: 'regular' | 'intensive'
  specific_date?: string | null
  teacher_id?: string | null
  booth_id?: string | null
  student_ids: string[]
}

type ConflictRow = {
  id: string
  teacher_id: string | null
  booth_id: string | null
  enrollments: { student_id: string }[]
}

export async function validateLessonConflicts(
  supabase: SupabaseClient,
  input: LessonValidationInput,
  excludeLessonId?: string
): Promise<LessonConflict[]> {
  let query = supabase
    .from('lessons')
    .select('id, teacher_id, booth_id, enrollments:lesson_enrollments(student_id)')
    .eq('lesson_kind', input.lesson_kind)
    .eq('slot_index', input.slot_index)

  if (input.lesson_kind === 'regular') {
    query = query.eq('day_of_week', input.day_of_week).eq('term_type', input.term_type)
  } else {
    query = query.eq('specific_date', input.specific_date ?? '')
  }

  if (excludeLessonId) {
    query = query.neq('id', excludeLessonId)
  }

  const { data } = await query
  const lessons = (data as unknown as ConflictRow[]) ?? []
  if (lessons.length === 0) return []

  const conflicts: LessonConflict[] = []

  if (input.teacher_id) {
    const hit = lessons.find((l) => l.teacher_id === input.teacher_id)
    if (hit) {
      conflicts.push({
        type: 'teacher',
        severity: 'error',
        message: 'この講師は同じ時間帯に別のコマが割り当てられています。',
      })
    }
  }

  const enrolled = lessons.flatMap((l) => l.enrollments.map((e) => e.student_id))
  const dup = input.student_ids.filter((sid) => enrolled.includes(sid))
  if (dup.length > 0) {
    conflicts.push({
      type: 'student',
      severity: 'error',
      message: `${dup.length}人の生徒が同じ時間帯に別のコマにも登録されています。`,
    })
  }

  if (input.booth_id) {
    const hit = lessons.find((l) => l.booth_id === input.booth_id)
    if (hit) {
      conflicts.push({
        type: 'booth',
        severity: 'warning',
        message: 'このブースは同じ時間帯に別のコマで使用中です。続けて保存しますか？',
      })
    }
  }

  return conflicts
}

// ─── 既存データ一括検査 ─────────────────────────────────────────────────────

export interface ExistingViolation {
  type: 'teacher' | 'student' | 'booth'
  lessonIds: string[]
  label: string
}

type FullLessonRow = {
  id: string
  lesson_kind: string
  day_of_week: number
  slot_index: number
  term_type: string
  specific_date: string | null
  teacher_id: string | null
  booth_id: string | null
  subject: string
  teacher: { name: string } | null
  booth: { name: string } | null
}

type EnrollmentRow = { lesson_id: string; student_id: string; student: { name: string } | null }

export async function findExistingViolations(supabase: SupabaseClient): Promise<ExistingViolation[]> {
  const [{ data: lessonsData }, { data: enrollmentsData }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, lesson_kind, day_of_week, slot_index, term_type, specific_date, teacher_id, booth_id, subject, teacher:teachers(name), booth:booths(name)'),
    supabase
      .from('lesson_enrollments')
      .select('lesson_id, student_id, student:students(name)'),
  ])

  const lessons = (lessonsData as unknown as FullLessonRow[]) ?? []
  const enrollments = (enrollmentsData as unknown as EnrollmentRow[]) ?? []

  // lesson_id → student list
  const byLesson = new Map<string, { student_id: string; name: string }[]>()
  for (const e of enrollments) {
    const list = byLesson.get(e.lesson_id) ?? []
    list.push({ student_id: e.student_id, name: e.student?.name ?? '' })
    byLesson.set(e.lesson_id, list)
  }

  // slot key → lessons in that slot
  const slotMap = new Map<string, FullLessonRow[]>()
  for (const l of lessons) {
    const key = l.lesson_kind === 'regular'
      ? `reg-${l.day_of_week}-${l.slot_index}-${l.term_type}`
      : `tmp-${l.specific_date}-${l.slot_index}`
    const list = slotMap.get(key) ?? []
    list.push(l)
    slotMap.set(key, list)
  }

  const violations: ExistingViolation[] = []

  for (const group of slotMap.values()) {
    if (group.length < 2) continue

    // Teacher double-booking
    const teachers = group.filter((l) => l.teacher_id)
    const teacherCounts = new Map<string, FullLessonRow[]>()
    for (const l of teachers) {
      const list = teacherCounts.get(l.teacher_id!) ?? []
      list.push(l)
      teacherCounts.set(l.teacher_id!, list)
    }
    for (const [, ls] of teacherCounts) {
      if (ls.length > 1) {
        violations.push({
          type: 'teacher',
          lessonIds: ls.map((l) => l.id),
          label: `講師ダブルブッキング: ${ls[0].teacher?.name ?? ls[0].teacher_id}（${ls.map((l) => l.subject).join(' / ')}）`,
        })
      }
    }

    // Student double-booking
    const studentLessons = new Map<string, FullLessonRow[]>()
    for (const l of group) {
      for (const e of byLesson.get(l.id) ?? []) {
        const list = studentLessons.get(e.student_id) ?? []
        list.push(l)
        studentLessons.set(e.student_id, list)
      }
    }
    for (const [sid, ls] of studentLessons) {
      if (ls.length > 1) {
        const enr = enrollments.find((e) => e.student_id === sid)
        violations.push({
          type: 'student',
          lessonIds: ls.map((l) => l.id),
          label: `生徒ダブルブッキング: ${enr?.student?.name ?? sid}（${ls.map((l) => l.subject).join(' / ')}）`,
        })
      }
    }

    // Booth conflict
    const booths = group.filter((l) => l.booth_id)
    const boothCounts = new Map<string, FullLessonRow[]>()
    for (const l of booths) {
      const list = boothCounts.get(l.booth_id!) ?? []
      list.push(l)
      boothCounts.set(l.booth_id!, list)
    }
    for (const [, ls] of boothCounts) {
      if (ls.length > 1) {
        violations.push({
          type: 'booth',
          lessonIds: ls.map((l) => l.id),
          label: `ブース重複: ${ls[0].booth?.name ?? ls[0].booth_id}（${ls.map((l) => l.subject).join(' / ')}）`,
        })
      }
    }
  }

  return violations
}

export interface PairingViolation {
  severity: 'warn' | 'block'
  label: string
}

// pairing_rules テーブルに基づく同時指導制約チェック
export async function checkPairingRules(
  supabase: SupabaseClient,
  lessonId: string,
  studentIds: string[]
): Promise<PairingViolation[]> {
  if (studentIds.length < 2) return []

  const [{ data: rules }, { data: students }] = await Promise.all([
    supabase.from('pairing_rules').select('*').eq('is_active', true),
    supabase.from('students').select('id, grade').in('id', studentIds),
  ])

  if (!rules || rules.length === 0 || !students) return []

  const violations: PairingViolation[] = []

  // grade_gap チェック
  const gradeOrder: Record<string, number> = {
    elem1: 1, elem2: 2, elem3: 3, elem4: 4, elem5: 5, elem6: 6,
    mid1: 7, mid2: 8, mid3: 9,
    high1: 10, high2: 11, high3: 12, other: 99,
  }

  for (const rule of rules as { rule_type: string; params: { max_gap?: number }; severity: 'warn' | 'block'; description: string | null }[]) {
    if (rule.rule_type === 'grade_gap' && rule.params.max_gap) {
      const grades = students.map((s) => gradeOrder[s.grade as string] ?? 99).filter((g) => g !== 99)
      if (grades.length >= 2) {
        const minGrade = Math.min(...grades)
        const maxGrade = Math.max(...grades)
        const gap = maxGrade - minGrade
        if (gap > rule.params.max_gap) {
          violations.push({
            severity: rule.severity,
            label: rule.description ?? `学年差${gap}（最大${rule.params.max_gap}）の同時指導`,
          })
        }
      }
    }
  }

  return violations
}
