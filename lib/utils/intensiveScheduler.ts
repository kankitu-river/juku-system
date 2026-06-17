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

export interface ProposedAssignment {
  studentId: string
  studentName: string
  studentGrade: string
  subject: string
  lessonId: string
  lessonLabel: string
  teacherId: string | null
  teacherName: string | null
  reasonCode: 'regular_senior' | 'regular' | 'preferred' | 'compatible'
  reasonLabel: string
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

export interface DraftScheduleResult {
  assignments: ProposedAssignment[]
  conflicts: ScheduleConflict[]
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

export function generateSchedule(
  students: StudentInfo[],
  lessons: LessonInfo[],
  plans: PlanInfo[],
  currentEnrollments: EnrollmentInfo[],
  regularTeacherMap: RegularTeacherMap,
  availabilityMap: AvailabilityMap = {},
): DraftScheduleResult {
  const assignments: ProposedAssignment[] = []
  const conflicts: ScheduleConflict[] = []

  const vacancyMap = new Map<string, number>()
  for (const l of lessons) vacancyMap.set(l.id, l.capacity - l.enrolled_count)

  const enrolledSet = new Set<string>()
  for (const e of currentEnrollments) enrolledSet.add(`${e.student_id}__${e.lesson_id}`)

  const pending = new Set<string>()

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

    const candidates = lessons
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
        score: scoreLesson(student, l.teacher_id, regularTeacherId, senior),
      }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)

    let assigned = 0
    for (const { lesson } of candidates) {
      if (assigned >= needed) break

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
        lessonId: lesson.id,
        lessonLabel: buildLessonLabel(lesson),
        teacherId: lesson.teacher_id,
        teacherName: lesson.teacher_name,
        reasonCode,
        reasonLabel,
      })

      pending.add(`${student.id}__${lesson.id}`)
      vacancyMap.set(lesson.id, (vacancyMap.get(lesson.id) ?? 0) - 1)
      assigned++
    }

    if (assigned < needed) {
      const regularTeacherHasAnySlot = regularTeacherId
        ? lessons.some((l) => l.subject === plan.subject && l.teacher_id === regularTeacherId)
        : false

      const regularTeacherName = regularTeacherId
        ? lessons.find((l) => l.teacher_id === regularTeacherId)?.teacher_name ?? null
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
    }
  }

  return { assignments, conflicts }
}
