export interface StudentInfo {
  id: string
  name: string
  grade: string
  preferred_teacher_ids: string[]
  ng_teacher_ids: string[]
}

export interface LessonInfo {
  id: string
  subject: string
  teacher_id: string | null
  teacher_name: string | null
  day_of_week: number
  slot_index: number
  specific_date: string | null
  capacity: number
  enrolled_count: number
}

export interface PlanInfo {
  student_id: string
  subject: string
  planned_count: number
}

export interface EnrollmentInfo {
  student_id: string
  lesson_id: string
}

// student_id -> subject -> teacher_id (通常授業で最も多い担当)
export type RegularTeacherMap = Record<string, Record<string, string>>

// シフトマッチング用（先生のシフトから新規コマを自動提案する）
export interface TeacherBasicInfo {
  id: string
  name: string
  subjects: string[]
}

export interface TeacherShiftInfo {
  teacher_id: string
  date: string        // YYYY-MM-DD
  start_time: string  // HH:MM(:SS)
  end_time: string
}

export interface SlotTime {
  index: number
  start: string
  end: string
}

export interface ShiftMatchingOptions {
  teachers: TeacherBasicInfo[]
  shifts: TeacherShiftInfo[]      // 期間内のシフトのみ渡すこと
  slotTimes: SlotTime[]           // 講習期間の時間帯定義
  slotLimits?: Record<string, number> | null  // dow -> 最終コマ番号
  closureDates?: string[]
}

// 新規コマ1つに入れる生徒数（個別指導のデフォルト定員）
const NEW_LESSON_CAPACITY = 2

export interface ProposedAssignment {
  studentId: string
  studentName: string
  studentGrade: string
  subject: string
  lessonId: string | null   // null = 新規コマを作成して割り当てる提案
  lessonLabel: string
  teacherId: string | null
  teacherName: string | null
  reasonCode: 'regular_senior' | 'regular' | 'preferred' | 'compatible' | 'ml_optimized'
  reasonLabel: string
  isNew?: boolean
  newLesson?: { teacherId: string; date: string; slotIndex: number }
}

export interface ScheduleConflict {
  studentId: string
  studentName: string
  studentGrade: string
  subject: string
  needed: number
  found: number
  isSenior: boolean
  regularTeacherName: string | null
  regularTeacherNoSlots: boolean
  alternatives: { teacherId: string; teacherName: string; availableCount: number }[]
}

// 入れ替え提案: 満員コマに適合度の高い生徒を入れ、既存生徒を別の枠へ移す
export interface SwapProposal {
  lessonId: string
  lessonLabel: string
  teacherName: string | null
  subject: string
  inStudentId: string
  inStudentName: string
  inReason: string
  outStudentId: string
  outStudentName: string
  outAlt: {
    lessonId: string | null
    label: string
    teacherName: string | null
    newLesson?: { teacherId: string; date: string; slotIndex: number }
  }
}

export interface DraftScheduleResult {
  assignments: ProposedAssignment[]
  conflicts: ScheduleConflict[]
  swaps: SwapProposal[]
}

const SENIOR_GRADES = ['高3']

function isSenior(grade: string) {
  return SENIOR_GRADES.includes(grade)
}

function scoreLesson(
  student: StudentInfo,
  teacherId: string | null,
  regularTeacherId: string | null,
  senior: boolean
): number {
  if (!teacherId) return 1
  if (student.ng_teacher_ids.includes(teacherId)) return -9999
  let score = 0
  if (teacherId === regularTeacherId) {
    score += senior ? 20 : 8  // 高3は通常担当を強く優先
  }
  if (student.preferred_teacher_ids.includes(teacherId)) {
    score += 5
  }
  return score
}

function buildLessonLabel(lesson: LessonInfo): string {
  const DAY = ['', '月', '火', '水', '木', '金', '土']
  if (lesson.specific_date) {
    return `${lesson.specific_date.slice(5).replace('-', '/')} 第${lesson.slot_index}コマ`
  }
  return `${DAY[lesson.day_of_week] ?? ''}曜 第${lesson.slot_index}コマ`
}

// studentId -> Set<"date__slotIndex">（来塾希望データ）
// 空Setなら希望未入力 = 全コマOKとして扱う
export type AvailabilityMap = Record<string, Set<string>>

function isStudentAvailable(studentId: string, lesson: LessonInfo, availabilityMap: AvailabilityMap): boolean {
  const avail = availabilityMap[studentId]
  if (!avail || avail.size === 0) return true          // 希望未入力 = 全コマOK
  if (!lesson.specific_date) return true               // 日付未確定コマは希望チェック不可
  return avail.has(`${lesson.specific_date}__${lesson.slot_index}`)
}

// コマの「時間帯キー」（同一日・同一コマの重複割り当て防止用）
function slotKeyOf(l: LessonInfo): string {
  return `${l.specific_date ?? `dow${l.day_of_week}`}__${l.slot_index}`
}

// コマの「日キー」（同一科目の同日集中を避ける分散用）
function dayKeyOf(l: LessonInfo): string {
  return l.specific_date ?? `dow${l.day_of_week}`
}

function timeHM(t: string): string {
  return t.slice(0, 5)
}

export function generateSchedule(
  students: StudentInfo[],
  lessons: LessonInfo[],
  plans: PlanInfo[],
  currentEnrollments: EnrollmentInfo[],
  regularTeacherMap: RegularTeacherMap,
  availabilityMap: AvailabilityMap = {},
  shiftOptions?: ShiftMatchingOptions,
): DraftScheduleResult {
  const assignments: ProposedAssignment[] = []
  const conflicts: ScheduleConflict[] = []
  const swaps: SwapProposal[] = []

  const vacancyMap = new Map<string, number>()
  for (const l of lessons) vacancyMap.set(l.id, l.capacity - l.enrolled_count)

  const studentById = new Map(students.map((s) => [s.id, s]))
  const lessonStudents = new Map<string, string[]>()
  for (const e of currentEnrollments) {
    if (!lessonStudents.has(e.lesson_id)) lessonStudents.set(e.lesson_id, [])
    lessonStudents.get(e.lesson_id)!.push(e.student_id)
  }

  const enrolledSet = new Set<string>()
  for (const e of currentEnrollments) enrolledSet.add(`${e.student_id}__${e.lesson_id}`)

  const pending = new Set<string>()

  // 生徒が既に埋まっている時間帯（既存受講 + 提案済み）
  const lessonById = new Map(lessons.map((l) => [l.id, l]))
  const busySlots = new Set<string>()   // `${studentId}__${slotKey}`
  const subjectDays = new Set<string>() // `${studentId}__${subject}__${dayKey}`
  for (const e of currentEnrollments) {
    const l = lessonById.get(e.lesson_id)
    if (!l) continue
    busySlots.add(`${e.student_id}__${slotKeyOf(l)}`)
    subjectDays.add(`${e.student_id}__${l.subject}__${dayKeyOf(l)}`)
  }

  // ===== シフトマッチング準備 =====
  // 先生が既存コマで埋まっている時間帯: `${teacherId}__${slotKey}`
  const teacherBusy = new Set<string>()
  for (const l of lessons) {
    if (l.teacher_id) teacherBusy.add(`${l.teacher_id}__${slotKeyOf(l)}`)
  }
  // 新規コマの登録簿: `${teacherId}__${date}__${slot}` -> { subject, remaining }
  const newLessonRegistry = new Map<string, { subject: string; remaining: number }>()

  const closureSet = new Set(shiftOptions?.closureDates ?? [])
  const teacherMap = new Map((shiftOptions?.teachers ?? []).map((t) => [t.id, t]))

  // 先生のシフトから (teacher, date, slot) の候補を作る
  function buildVirtualCandidates(student: StudentInfo, subject: string): LessonInfo[] {
    if (!shiftOptions) return []
    const result: LessonInfo[] = []
    const seen = new Set<string>()
    const avail = availabilityMap[student.id]

    for (const shift of shiftOptions.shifts) {
      const teacher = teacherMap.get(shift.teacher_id)
      if (!teacher) continue
      // 科目対応チェック（担当科目が未登録の先生は全科目OKとして扱う）
      if (teacher.subjects.length > 0 && !teacher.subjects.includes(subject)) continue
      if (student.ng_teacher_ids.includes(teacher.id)) continue
      if (closureSet.has(shift.date)) continue

      const dow = new Date(`${shift.date}T12:00:00`).getDay()
      if (dow === 0) continue
      const maxSlot = shiftOptions.slotLimits?.[String(dow)]

      for (const slot of shiftOptions.slotTimes) {
        if (maxSlot && slot.index > maxSlot) continue
        // シフトが時間帯をカバーしているか
        if (!(timeHM(shift.start_time) <= slot.start && timeHM(shift.end_time) >= slot.end)) continue
        // 生徒の来塾希望（入力済みの場合のみ絞り込み）
        if (avail && avail.size > 0 && !avail.has(`${shift.date}__${slot.index}`)) continue

        const key = `${teacher.id}__${shift.date}__${slot.index}`
        if (seen.has(key)) continue
        seen.add(key)

        // 既存コマで先生が埋まっている時間帯は除外
        if (teacherBusy.has(`${teacher.id}__${shift.date}__${slot.index}`)) continue
        if (teacherBusy.has(`${teacher.id}__dow${dow}__${slot.index}`)) continue

        // すでに別科目の新規コマが提案済み・満員なら除外
        const reg = newLessonRegistry.get(key)
        if (reg && (reg.subject !== subject || reg.remaining <= 0)) continue

        result.push({
          id: `new__${key}`,
          subject,
          teacher_id: teacher.id,
          teacher_name: teacher.name,
          day_of_week: dow,
          slot_index: slot.index,
          specific_date: shift.date,
          capacity: NEW_LESSON_CAPACITY,
          enrolled_count: 0,
        })
      }
    }
    return result
  }

  // 高3を先に処理して枠を確保
  const sortedPlans = [...plans].sort((a, b) => {
    const sa = students.find((s) => s.id === a.student_id)
    const sb = students.find((s) => s.id === b.student_id)
    return (isSenior(sa?.grade ?? '') ? 0 : 1) - (isSenior(sb?.grade ?? '') ? 0 : 1)
  })

  for (const plan of sortedPlans) {
    const student = students.find((s) => s.id === plan.student_id)
    if (!student) continue

    const senior = isSenior(student.grade)
    const regularTeacherId = regularTeacherMap[student.id]?.[plan.subject] ?? null

    const alreadyEnrolled = lessons.filter(
      (l) =>
        l.subject === plan.subject &&
        (enrolledSet.has(`${student.id}__${l.id}`) || pending.has(`${student.id}__${l.id}`))
    ).length

    const needed = plan.planned_count - alreadyEnrolled
    if (needed <= 0) continue

    // 既存コマの候補
    const realCandidates = lessons
      .filter((l) => {
        if (l.subject !== plan.subject) return false
        if (enrolledSet.has(`${student.id}__${l.id}`)) return false
        if (pending.has(`${student.id}__${l.id}`)) return false
        if ((vacancyMap.get(l.id) ?? 0) <= 0) return false
        if (!isStudentAvailable(student.id, l, availabilityMap)) return false
        return true
      })
      .map((l) => ({
        lesson: l,
        isNew: false,
        score: scoreLesson(student, l.teacher_id, regularTeacherId, senior),
      }))

    // シフトから作る新規コマの候補（既存コマをわずかに優先するため -1）
    const virtualCandidates = buildVirtualCandidates(student, plan.subject)
      .map((l) => ({
        lesson: l,
        isNew: true,
        score: scoreLesson(student, l.teacher_id, regularTeacherId, senior) - 1,
      }))

    const candidates = [...realCandidates, ...virtualCandidates]
      .filter((x) => x.score >= -1 && x.score > -9000)
      // 同点なら日付の早いコマから（期間の前半に寄せて後半を調整余地に残す）
      .sort((a, b) =>
        b.score - a.score ||
        (a.lesson.specific_date ?? '9999').localeCompare(b.lesson.specific_date ?? '9999')
      )

    let assigned = 0
    // 1周目: 同一科目は1日1コマまでに分散して割り当て
    // 2周目: それでも足りない場合のみ同日複数コマを許可（時間帯の重複は常に不可）
    for (const allowSameDay of [false, true]) {
      for (const { lesson, isNew } of candidates) {
        if (assigned >= needed) break
        if (pending.has(`${student.id}__${lesson.id}`)) continue
        // 同じ日・同じ時間帯に別のコマが入っていたら不可
        if (busySlots.has(`${student.id}__${slotKeyOf(lesson)}`)) continue
        // 分散: 同一科目の同日重複は1周目では避ける
        if (!allowSameDay && subjectDays.has(`${student.id}__${plan.subject}__${dayKeyOf(lesson)}`)) continue

        if (isNew) {
          // 新規コマの空き状況を登録簿でチェック・更新
          const key = `${lesson.teacher_id}__${lesson.specific_date}__${lesson.slot_index}`
          const reg = newLessonRegistry.get(key)
          if (reg) {
            if (reg.subject !== plan.subject || reg.remaining <= 0) continue
            reg.remaining--
          } else {
            if (teacherBusy.has(`${lesson.teacher_id}__${lesson.specific_date}__${lesson.slot_index}`)) continue
            newLessonRegistry.set(key, { subject: plan.subject, remaining: NEW_LESSON_CAPACITY - 1 })
          }
        } else {
          if ((vacancyMap.get(lesson.id) ?? 0) <= 0) continue
          vacancyMap.set(lesson.id, (vacancyMap.get(lesson.id) ?? 0) - 1)
        }

        let reasonCode: ProposedAssignment['reasonCode']
        let reasonLabel: string
        if (lesson.teacher_id === regularTeacherId && senior) {
          reasonCode = 'regular_senior'; reasonLabel = '受験生・通常担当優先'
        } else if (lesson.teacher_id === regularTeacherId) {
          reasonCode = 'regular'; reasonLabel = '通常担当'
        } else if (student.preferred_teacher_ids.includes(lesson.teacher_id ?? '')) {
          reasonCode = 'preferred'; reasonLabel = '任せたい先生'
        } else {
          reasonCode = 'compatible'; reasonLabel = '科目対応可'
        }

        assignments.push({
          studentId: student.id,
          studentName: student.name,
          studentGrade: student.grade,
          subject: plan.subject,
          lessonId: isNew ? null : lesson.id,
          lessonLabel: buildLessonLabel(lesson),
          teacherId: lesson.teacher_id,
          teacherName: lesson.teacher_name,
          reasonCode,
          reasonLabel,
          isNew,
          newLesson: isNew && lesson.teacher_id && lesson.specific_date
            ? { teacherId: lesson.teacher_id, date: lesson.specific_date, slotIndex: lesson.slot_index }
            : undefined,
        })

        pending.add(`${student.id}__${lesson.id}`)
        busySlots.add(`${student.id}__${slotKeyOf(lesson)}`)
        subjectDays.add(`${student.id}__${plan.subject}__${dayKeyOf(lesson)}`)
        assigned++
      }
      if (assigned >= needed) break
    }

    if (assigned < needed) {
      const regularTeacherHasAnySlot = regularTeacherId
        ? lessons.some((l) => l.subject === plan.subject && l.teacher_id === regularTeacherId)
        : false

      const regularTeacherName = regularTeacherId
        ? lessons.find((l) => l.teacher_id === regularTeacherId)?.teacher_name
          ?? teacherMap.get(regularTeacherId)?.name
          ?? null
        : null

      const altMap = new Map<string, { name: string; count: number }>()
      for (const l of lessons) {
        if (l.subject !== plan.subject) continue
        if (!l.teacher_id || l.teacher_id === regularTeacherId) continue
        if (student.ng_teacher_ids.includes(l.teacher_id)) continue
        if ((vacancyMap.get(l.id) ?? 0) <= 0) continue
        const cur = altMap.get(l.teacher_id) ?? { name: l.teacher_name ?? '', count: 0 }
        altMap.set(l.teacher_id, { ...cur, count: cur.count + 1 })
      }

      conflicts.push({
        studentId: student.id,
        studentName: student.name,
        studentGrade: student.grade,
        subject: plan.subject,
        needed,
        found: assigned,
        isSenior: senior,
        regularTeacherName,
        regularTeacherNoSlots: !!regularTeacherId && !regularTeacherHasAnySlot,
        alternatives: Array.from(altMap.entries())
          .map(([id, v]) => ({ teacherId: id, teacherName: v.name, availableCount: v.count }))
          .sort((a, b) => b.availableCount - a.availableCount)
          .slice(0, 3),
      })

      // ===== 入れ替え提案 =====
      // 満員コマのうち、この生徒の方が明確に適合度が高い（通常担当・任せたい先生など）枠があれば、
      // 既存生徒の移動先とセットで入れ替えを提案する
      let best: { gain: number; proposal: SwapProposal } | null = null
      for (const L of lessons) {
        if (L.subject !== plan.subject) continue
        if ((vacancyMap.get(L.id) ?? 0) > 0) continue // 空きがあれば通常割り当てで入れるので対象外
        if (!L.teacher_id) continue
        if (student.ng_teacher_ids.includes(L.teacher_id)) continue
        if (!isStudentAvailable(student.id, L, availabilityMap)) continue
        if (busySlots.has(`${student.id}__${slotKeyOf(L)}`)) continue

        const scoreNew = scoreLesson(student, L.teacher_id, regularTeacherId, senior)
        if (scoreNew < 5) continue // 明確な理由がある場合のみ提案

        for (const eid of lessonStudents.get(L.id) ?? []) {
          if (eid === student.id) continue
          const eStudent = studentById.get(eid)
          if (!eStudent) continue
          const eSenior = isSenior(eStudent.grade)
          const eRegular = regularTeacherMap[eid]?.[plan.subject] ?? null
          const scoreE = scoreLesson(eStudent, L.teacher_id, eRegular, eSenior)
          if (scoreNew < scoreE + 5) continue // 入れ替えるほどの差がない

          // 既存生徒 E の他の受講時間帯（L を除く）
          const eBusy = new Set<string>()
          for (const en of currentEnrollments) {
            if (en.student_id !== eid) continue
            const el = lessonById.get(en.lesson_id)
            if (el && el.id !== L.id) eBusy.add(slotKeyOf(el))
          }

          // E の移動先候補（既存コマの空き or シフトからの新規コマ）
          const altReal = lessons
            .filter((al) =>
              al.id !== L.id && al.subject === plan.subject &&
              (vacancyMap.get(al.id) ?? 0) > 0 &&
              !(al.teacher_id && eStudent.ng_teacher_ids.includes(al.teacher_id)) &&
              isStudentAvailable(eid, al, availabilityMap) &&
              !eBusy.has(slotKeyOf(al))
            )
            .map((al) => ({ lesson: al, score: scoreLesson(eStudent, al.teacher_id, eRegular, eSenior), isNew: false }))
          const altVirtual = buildVirtualCandidates(eStudent, plan.subject)
            .filter((al) => !eBusy.has(slotKeyOf(al)))
            .map((al) => ({ lesson: al, score: scoreLesson(eStudent, al.teacher_id, eRegular, eSenior) - 1, isNew: true }))

          const alt = [...altReal, ...altVirtual].sort((a, b) => b.score - a.score)[0]
          if (!alt) continue

          const gain = (scoreNew - scoreE) + Math.max(alt.score, 0)
          if (best && gain <= best.gain) continue

          const inReason =
            L.teacher_id === regularTeacherId && senior ? '受験生・通常担当'
            : L.teacher_id === regularTeacherId ? '通常担当'
            : '任せたい先生'

          best = {
            gain,
            proposal: {
              lessonId: L.id,
              lessonLabel: buildLessonLabel(L),
              teacherName: L.teacher_name,
              subject: plan.subject,
              inStudentId: student.id,
              inStudentName: student.name,
              inReason,
              outStudentId: eid,
              outStudentName: eStudent.name,
              outAlt: {
                lessonId: alt.isNew ? null : alt.lesson.id,
                label: buildLessonLabel(alt.lesson),
                teacherName: alt.lesson.teacher_name,
                newLesson: alt.isNew && alt.lesson.teacher_id && alt.lesson.specific_date
                  ? { teacherId: alt.lesson.teacher_id, date: alt.lesson.specific_date, slotIndex: alt.lesson.slot_index }
                  : undefined,
              },
            },
          }
        }
      }
      if (best) swaps.push(best.proposal)
    }
  }

  return { assignments, conflicts, swaps }
}
