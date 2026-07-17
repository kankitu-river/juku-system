export interface StudentProfile {
  id: string
  subjects: string[]
  preferred_teacher_ids: string[]
  ng_teacher_ids: string[]
}

export interface TeacherProfile {
  id: string
  name: string
  subjects: string[]
}

export interface LessonCandidate {
  id: string
  title: string
  subject: string | null
  type: 'group' | 'individual'
  lesson_kind?: string | null
  specific_date?: string | null
  day_of_week: number
  slot_index: number
  term_type: 'regular' | 'intensive'
  teacher_id: string | null
  teacher?: TeacherProfile | null
  booth?: { id: string; name: string } | null
  enrollments?: { id: string }[]
  capacity: number
}

export interface ShiftRecord {
  teacher_id: string
  date: string
}

export interface RecentAssignment {
  student: { id: string } | null
  lesson: { teacher: { id: string } | null } | null
}

export interface TermPeriodRecord {
  type: 'regular' | 'intensive'
  start_date: string
  end_date: string
}

export interface ScoredCandidate {
  lesson: LessonCandidate
  date: string
  score: number
  isPreferred: boolean
  isNg: boolean
  subjectMatch: boolean
  hasShift: boolean
  isFull: boolean
  isDiversityPenalized: boolean
  recentAssignCount: number
}

function getTermTypeForDate(date: string, termPeriods: TermPeriodRecord[]): 'regular' | 'intensive' {
  return termPeriods.find((t) => t.start_date <= date && date <= t.end_date)?.type ?? 'regular'
}

function getDatesInRange(startStr: string, endStr: string): string[] {
  const dates: string[] = []
  const cur = new Date(`${startStr}T12:00:00`)
  const end = new Date(`${endStr}T12:00:00`)
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export function buildRecentTeacherCounts(
  studentId: string,
  recentAssignments: RecentAssignment[]
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const a of recentAssignments) {
    if (a.student?.id !== studentId) continue
    const tid = a.lesson?.teacher?.id
    if (tid) counts[tid] = (counts[tid] ?? 0) + 1
  }
  return counts
}

export function scoreLesson(
  lesson: LessonCandidate,
  date: string,
  student: StudentProfile,
  shifts: ShiftRecord[],
  recentTeacherCounts: Record<string, number>
): Omit<ScoredCandidate, 'lesson' | 'date'> {
  const teacherId = lesson.teacher_id
  const isNg = teacherId ? student.ng_teacher_ids.includes(teacherId) : false
  const isPreferred = teacherId ? student.preferred_teacher_ids.includes(teacherId) : false
  const teacherSubjects = lesson.teacher?.subjects ?? []
  const subjectMatch = student.subjects.some((s) => teacherSubjects.includes(s))
  const hasShift = teacherId
    ? shifts.some((s) => s.teacher_id === teacherId && s.date === date)
    : false
  const isFull = (lesson.enrollments?.length ?? 0) >= lesson.capacity
  const recentAssignCount = teacherId ? (recentTeacherCounts[teacherId] ?? 0) : 0
  const isDiversityPenalized = recentAssignCount >= 2

  let score = 0
  if (subjectMatch) score += 2
  if (hasShift) score += 2
  if (isPreferred) score += 3
  if (lesson.lesson_kind === 'temporary') score += 5
  // 同一講師の偏りを抑制（2回以上で減点）
  if (isDiversityPenalized) score -= recentAssignCount - 1

  return { score, isPreferred, isNg, subjectMatch, hasShift, isFull, isDiversityPenalized, recentAssignCount }
}

export function generateSuggestions(
  student: StudentProfile,
  lessons: LessonCandidate[],
  shifts: ShiftRecord[],
  recentAssignments: RecentAssignment[],
  termPeriods: TermPeriodRecord[],
  dateRange: { start: string; end: string }
): ScoredCandidate[] {
  const recentTeacherCounts = buildRecentTeacherCounts(student.id, recentAssignments)
  const dates = getDatesInRange(dateRange.start, dateRange.end)
  const candidates: ScoredCandidate[] = []

  for (const date of dates) {
    const dow = new Date(`${date}T12:00:00`).getDay()
    const termType = getTermTypeForDate(date, termPeriods)

    const dailyLessons = lessons.filter((l) =>
      l.lesson_kind === 'temporary'
        ? l.specific_date === date
        : l.day_of_week === dow && l.term_type === termType
    )

    for (const lesson of dailyLessons) {
      const scored = scoreLesson(lesson, date, student, shifts, recentTeacherCounts)
      if (!scored.isNg) {
        candidates.push({ lesson, date, ...scored })
      }
    }
  }

  return candidates.sort((a, b) => {
    if (a.isFull !== b.isFull) return a.isFull ? 1 : -1
    return b.score - a.score
  })
}

export function getLessonsForDate(
  date: string,
  lessons: LessonCandidate[],
  termPeriods: TermPeriodRecord[]
): LessonCandidate[] {
  const dow = new Date(`${date}T12:00:00`).getDay()
  const termType = getTermTypeForDate(date, termPeriods)
  return lessons.filter((l) =>
    l.lesson_kind === 'temporary'
      ? l.specific_date === date
      : l.day_of_week === dow && l.term_type === termType
  )
}
