'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateSchedule, type DraftScheduleResult, type AvailabilityMap, type SlotTime } from '@/lib/utils/intensiveScheduler'
import { INTENSIVE_SLOTS, type IntensiveSlotLimits } from '@/lib/constants/timeSlots'

type RegularEnrollmentRow = {
  student_id: string
  lesson: { subject: string; teacher_id: string | null; term_type: string } | null
}
type IntensiveLessonRow = {
  id: string; subject: string; teacher_id: string | null
  teacher: { id: string; name: string } | null
  day_of_week: number; slot_index: number; specific_date: string | null
  capacity: number; term_type: string
  enrollments: { student_id: string }[]
}
type StudentRow = { id: string; name: string; grade: string; preferred_teacher_ids: string[] | null; ng_teacher_ids: string[] | null }
type IntensivePlanRow = { student_id: string; subject: string; planned_count: number }
type EnrollmentRow = { student_id: string; lesson_id: string }
type TeacherRow = { id: string; name: string; subjects: string[] | null }
type ShiftRow = { teacher_id: string; date: string; start_time: string; end_time: string }
type ClosureRow = { date: string }

// 講習コマの一括作成（日付×スロットの組み合わせで臨時コマとして作成）
export async function bulkCreateIntensiveLessons(input: {
  subject: string
  teacher_id: string | null
  booth_id: string | null
  type: 'individual' | 'group'
  capacity: number
  entries: { date: string; slot_index: number }[]
}): Promise<{ count?: number; error?: string }> {
  if (!input.subject) return { error: '科目を選択してください' }
  if (input.entries.length === 0) return { error: '日付とコマを選択してください' }

  const supabase = await createClient()

  const rows = input.entries.map((e) => {
    const dow = new Date(`${e.date}T12:00:00`).getDay()
    return {
      title: input.subject,
      type: input.type,
      lesson_kind: 'temporary' as const, // 特定日のコマとして作成（週間カレンダーにその日だけ表示される）
      specific_date: e.date,
      subject: input.subject,
      teacher_id: input.teacher_id || null,
      day_of_week: dow,
      slot_index: e.slot_index,
      term_type: 'intensive' as const,
      booth_id: input.booth_id || null,
      capacity: input.capacity,
      is_ps1: false,
      notes: null,
    }
  })

  const { error } = await supabase.from('lessons').insert(rows)
  if (error) return { error: error.message }

  revalidatePath('/schedule/intensive')
  revalidatePath('/schedule')
  return { count: rows.length }
}

// 生徒の持ちコマ（科目×コマ数）をまとめて保存（SET方式: 渡された内容が最終状態になる）
export async function saveStudentPlans(
  studentId: string,
  termPeriodId: string,
  plans: { subject: string; count: number }[]
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('intensive_plans')
    .select('subject')
    .eq('student_id', studentId)
    .eq('term_period_id', termPeriodId)

  const valid = plans.filter((p) => p.subject && p.count >= 1)
  const keepSubjects = new Set(valid.map((p) => p.subject))

  // 入力から消えた科目のプランは削除
  const toDelete = ((existing ?? []) as { subject: string }[])
    .map((e) => e.subject)
    .filter((s) => !keepSubjects.has(s))
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('intensive_plans')
      .delete()
      .eq('student_id', studentId)
      .eq('term_period_id', termPeriodId)
      .in('subject', toDelete)
    if (error) return { error: error.message }
  }

  if (valid.length > 0) {
    const { error } = await supabase
      .from('intensive_plans')
      .upsert(
        valid.map((p) => ({
          student_id: studentId,
          term_period_id: termPeriodId,
          subject: p.subject,
          planned_count: p.count,
        })),
        { onConflict: 'student_id,term_period_id,subject' }
      )
    if (error) return { error: error.message }
  }

  revalidatePath('/schedule/intensive')
  return {}
}

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
  termPeriodId: string,
  targetStudentIds?: string[]  // 指定時はこの生徒だけを対象に割り振る
): Promise<{ result?: DraftScheduleResult; error?: string }> {
  const supabase = await createClient()

  const { data: termPeriod } = await supabase
    .from('term_periods')
    .select('id, start_date, end_date')
    .eq('id', termPeriodId)
    .single()
  if (!termPeriod) return { error: '講習期間が見つかりません' }

  const [
    { data: students },
    { data: lessons },
    { data: plans },
    { data: currentEnrollments },
    { data: availabilityRows },
    { data: regularEnrollments },
    { data: teachers },
    { data: shifts },
    { data: slotSetting },
    { data: slotLimitSetting },
    { data: closures },
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
    supabase.from('teachers').select('id, name, subjects'),
    supabase.from('shifts').select('teacher_id, date, start_time, end_time')
      .gte('date', termPeriod.start_date)
      .lte('date', termPeriod.end_date),
    supabase.from('app_settings').select('value').eq('key', 'time_slots').single(),
    supabase.from('app_settings').select('value').eq('key', 'intensive_slot_limits').single(),
    supabase.from('school_closures').select('date'),
  ])

  if (!students || !lessons || !plans) return { error: 'データ取得に失敗しました' }

  // regularTeacherMap: student_id -> subject -> teacher_id (出現数が最多の先生)
  const teacherCountMap: Record<string, Record<string, Record<string, number>>> = {}
  for (const row of (regularEnrollments ?? []) as unknown as RegularEnrollmentRow[]) {
    const lesson = row.lesson
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

  const lessonInfos = (lessons as unknown as IntensiveLessonRow[])
    .map((l) => ({
      id: l.id,
      subject: l.subject,
      teacher_id: l.teacher_id ?? null,
      teacher_name: l.teacher?.name ?? null,
      day_of_week: l.day_of_week,
      slot_index: l.slot_index,
      specific_date: l.specific_date ?? null,
      capacity: l.capacity,
      enrolled_count: (l.enrollments ?? []).length,
    }))
    // 選択した講習期間のコマだけを候補にする（過去の講習コマへの誤割り当て防止）
    .filter((l) =>
      !termPeriod || !l.specific_date ||
      (l.specific_date >= termPeriod.start_date && l.specific_date <= termPeriod.end_date)
    )

  // 講習の時間帯定義（カスタム設定があれば優先）
  const customSlots = (slotSetting?.value as { intensive?: SlotTime[] } | null)?.intensive
  const slotTimes: SlotTime[] = customSlots && customSlots.length > 0 ? customSlots : INTENSIVE_SLOTS
  const slotLimits = (slotLimitSetting?.value as IntensiveSlotLimits) ?? null

  const result = generateSchedule(
    (students as StudentRow[]).map((s) => ({
      id: s.id,
      name: s.name,
      grade: s.grade,
      preferred_teacher_ids: s.preferred_teacher_ids ?? [],
      ng_teacher_ids: s.ng_teacher_ids ?? [],
    })),
    lessonInfos,
    (plans as IntensivePlanRow[])
      .filter((p) => !targetStudentIds || targetStudentIds.length === 0 || targetStudentIds.includes(p.student_id))
      .map((p) => ({
        student_id: p.student_id,
        subject: p.subject,
        planned_count: p.planned_count,
      })),
    (currentEnrollments as EnrollmentRow[] ?? []).map((e) => ({
      student_id: e.student_id,
      lesson_id: e.lesson_id,
    })),
    regularTeacherMap,
    availabilityMap,
    {
      teachers: ((teachers as TeacherRow[]) ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        subjects: t.subjects ?? [],
      })),
      shifts: ((shifts as ShiftRow[]) ?? []).map((s) => ({
        teacher_id: s.teacher_id,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
      })),
      slotTimes,
      slotLimits,
      closureDates: ((closures as ClosureRow[]) ?? []).map((c) => c.date),
    },
  )

  return { result }
}

// 入れ替え提案の適用: 既存生徒を別の枠へ移し、新しい生徒を満員コマに入れる
export async function applyScheduleSwap(swap: {
  lessonId: string
  subject: string
  inStudentId: string
  outStudentId: string
  outAlt: {
    lessonId: string | null
    newLesson?: { teacherId: string; date: string; slotIndex: number }
  }
}): Promise<{ error?: string }> {
  const supabase = await createClient()

  // 1. 既存生徒を元のコマから外す
  const { error: delError } = await supabase
    .from('lesson_enrollments')
    .delete()
    .eq('student_id', swap.outStudentId)
    .eq('lesson_id', swap.lessonId)
  if (delError) return { error: `移動元の削除エラー: ${delError.message}` }

  // 2. 既存生徒を移動先へ（新規コマの場合は作成）
  let altLessonId = swap.outAlt.lessonId
  if (!altLessonId && swap.outAlt.newLesson) {
    const { teacherId, date, slotIndex } = swap.outAlt.newLesson
    const dow = new Date(`${date}T12:00:00`).getDay()
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .insert({
        title: swap.subject,
        type: 'individual',
        lesson_kind: 'temporary',
        specific_date: date,
        subject: swap.subject || null,
        teacher_id: teacherId,
        day_of_week: dow,
        slot_index: slotIndex,
        term_type: 'intensive',
        booth_id: null,
        capacity: 2,
        is_ps1: false,
        notes: null,
      })
      .select('id')
      .single()
    if (lessonError) return { error: `移動先コマの作成エラー: ${lessonError.message}` }
    altLessonId = lesson.id
  }
  if (!altLessonId) return { error: '移動先が不明です' }

  const { error: moveError } = await supabase
    .from('lesson_enrollments')
    .insert({ student_id: swap.outStudentId, lesson_id: altLessonId, subject: swap.subject || null })
  if (moveError) return { error: `移動先への登録エラー: ${moveError.message}` }

  // 3. 新しい生徒を空いた枠へ
  const { error: inError } = await supabase
    .from('lesson_enrollments')
    .insert({ student_id: swap.inStudentId, lesson_id: swap.lessonId, subject: swap.subject || null })
  if (inError) return { error: `割り当てエラー: ${inError.message}` }

  revalidatePath('/schedule/intensive')
  revalidatePath('/schedule')
  return {}
}

export async function applyDraftSchedule(
  items: {
    studentId: string
    lessonId: string | null
    subject?: string
    newLesson?: { teacherId: string; date: string; slotIndex: number }
  }[]
): Promise<{ count: number; error?: string }> {
  if (items.length === 0) return { count: 0 }
  const supabase = await createClient()
  let count = 0

  // 既存コマへの割り当て
  const existing = items.filter((i) => i.lessonId)
  if (existing.length > 0) {
    const rows = existing.map((e) => ({
      student_id: e.studentId,
      lesson_id: e.lessonId!,
      ...(e.subject ? { subject: e.subject } : {}),
    }))
    const { error } = await supabase
      .from('lesson_enrollments')
      .upsert(rows, { onConflict: 'student_id,lesson_id', ignoreDuplicates: true })
    if (error) return { count: 0, error: error.message }
    count += existing.length
  }

  // 新規コマの作成 + 割り当て（同じ先生・日付・コマの提案は1つのコマにまとめる）
  const newItems = items.filter((i) => !i.lessonId && i.newLesson)
  const groups = new Map<string, typeof newItems>()
  for (const item of newItems) {
    const key = `${item.newLesson!.teacherId}__${item.newLesson!.date}__${item.newLesson!.slotIndex}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  for (const group of groups.values()) {
    const { teacherId, date, slotIndex } = group[0].newLesson!
    const subject = group[0].subject ?? ''
    const dow = new Date(`${date}T12:00:00`).getDay()

    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .insert({
        title: subject,
        type: 'individual',
        lesson_kind: 'temporary',
        specific_date: date,
        subject: subject || null,
        teacher_id: teacherId,
        day_of_week: dow,
        slot_index: slotIndex,
        term_type: 'intensive',
        booth_id: null,
        capacity: Math.max(2, group.length),
        is_ps1: false,
        notes: null,
      })
      .select('id')
      .single()
    if (lessonError) return { count, error: `コマ作成エラー: ${lessonError.message}` }

    const rows = group.map((g) => ({
      student_id: g.studentId,
      lesson_id: lesson.id,
      subject: g.subject ?? null,
    }))
    const { error: enrollError } = await supabase.from('lesson_enrollments').insert(rows)
    if (enrollError) return { count, error: `割り当てエラー: ${enrollError.message}` }
    count += group.length
  }

  revalidatePath('/schedule/intensive')
  revalidatePath('/schedule')
  return { count }
}
