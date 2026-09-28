import { getLessonsForDate, type LessonCandidate, type TermPeriodRecord } from './makeupSuggestion'
import { getSlotsForLesson, getSlotLabel } from '@/lib/constants/timeSlots'

export interface ReconcileStudent {
  id: string
  subjects: string[]
  ng_teacher_ids: string[]
  preferred_teacher_ids: string[]
}

export interface ReconcileCandidate {
  lessonId: string
  slotLabel: string
  teacherName: string
  boothName: string | null
  subjectMatch: boolean
  isPreferred: boolean
  isFull: boolean
}

// 「16：30」「16:30」「18時15分」等から分（0-1439）を取り出す
export function parseTimeMinutes(raw: string): number | null {
  const norm = raw
    .replace(/[０-９]/g, (d) => '０１２３４５６７８９'.indexOf(d).toString())
    .replace(/[：]/g, ':')
  const m = norm.match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = +m[1]
  const mi = +m[2]
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

function lessonStartMinutes(l: LessonCandidate): number | null {
  const slots = getSlotsForLesson(l.type, l.day_of_week, l.term_type)
  const slot = slots.find((s) => s.index === l.slot_index)
  if (!slot) return null
  const [h, mi] = slot.start.split(':').map(Number)
  return h * 60 + mi
}

// 決定1件（日付＋希望時間）に対して、スケジュール上の候補コマを返す
export function matchCandidates(
  date: string,
  desiredRaw: string,
  student: ReconcileStudent,
  lessons: LessonCandidate[],
  termPeriods: TermPeriodRecord[],
  tolerance = 30
): ReconcileCandidate[] {
  const dayLessons = getLessonsForDate(date, lessons, termPeriods)
  const desired = parseTimeMinutes(desiredRaw)
  let pool = dayLessons
  if (desired !== null) {
    pool = dayLessons.filter((l) => {
      const st = lessonStartMinutes(l)
      return st !== null && Math.abs(st - desired) <= tolerance
    })
  }
  // NG講師は除外
  pool = pool.filter((l) => !(l.teacher_id && student.ng_teacher_ids.includes(l.teacher_id)))

  const cands: ReconcileCandidate[] = pool.map((l) => ({
    lessonId: l.id,
    slotLabel: getSlotLabel(l.slot_index, l.day_of_week, l.term_type, l.type),
    teacherName: l.teacher?.name ?? '担当未設定',
    boothName: l.booth?.name ?? null,
    subjectMatch: (l.teacher?.subjects ?? []).some((s) => student.subjects.includes(s)),
    isPreferred: !!(l.teacher_id && student.preferred_teacher_ids.includes(l.teacher_id)),
    isFull: (l.enrollments?.length ?? 0) >= l.capacity,
  }))
  // 空き→科目一致→任せたい の順
  return cands.sort((a, b) => {
    if (a.isFull !== b.isFull) return a.isFull ? 1 : -1
    if (a.subjectMatch !== b.subjectMatch) return a.subjectMatch ? -1 : 1
    if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1
    return 0
  })
}
