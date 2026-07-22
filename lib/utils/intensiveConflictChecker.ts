// 講習割当画面用のクライアントサイド整合チェック（Supabase 非依存・純関数）

export interface CheckLesson {
  id: string
  specific_date: string | null
  day_of_week: number
  slot_index: number
  teacher: { id: string; name: string } | null
  enrollments: { student_id: string }[]
}

export interface ConflictItem {
  lessonIds: string[]
  label: string
}

export interface ConflictSummary {
  teacherConflicts: ConflictItem[]
  studentConflicts: ConflictItem[]
  conflictLessonIds: Set<string>
}

function slotKey(lesson: CheckLesson): string {
  return lesson.specific_date
    ? `${lesson.specific_date}__${lesson.slot_index}`
    : `dow${lesson.day_of_week}__${lesson.slot_index}`
}

export function checkIntensiveConflicts(
  lessons: CheckLesson[],
  studentNames: Map<string, string>
): ConflictSummary {
  const slotMap = new Map<string, CheckLesson[]>()
  for (const l of lessons) {
    const key = slotKey(l)
    const list = slotMap.get(key) ?? []
    list.push(l)
    slotMap.set(key, list)
  }

  const teacherConflicts: ConflictItem[] = []
  const studentConflicts: ConflictItem[] = []
  const conflictLessonIds = new Set<string>()

  for (const group of slotMap.values()) {
    if (group.length < 2) continue

    // 同一講師の同一スロット重複
    const teacherMap = new Map<string, CheckLesson[]>()
    for (const l of group) {
      if (!l.teacher) continue
      const list = teacherMap.get(l.teacher.id) ?? []
      list.push(l)
      teacherMap.set(l.teacher.id, list)
    }
    for (const [, ls] of teacherMap) {
      if (ls.length < 2) continue
      const ids = ls.map((l) => l.id)
      ids.forEach((id) => conflictLessonIds.add(id))
      teacherConflicts.push({ lessonIds: ids, label: ls[0].teacher!.name })
    }

    // 同一生徒の同一スロット重複
    const studentMap = new Map<string, CheckLesson[]>()
    for (const l of group) {
      for (const e of l.enrollments) {
        const list = studentMap.get(e.student_id) ?? []
        list.push(l)
        studentMap.set(e.student_id, list)
      }
    }
    for (const [sid, ls] of studentMap) {
      if (ls.length < 2) continue
      const ids = ls.map((l) => l.id)
      ids.forEach((id) => conflictLessonIds.add(id))
      studentConflicts.push({ lessonIds: ids, label: studentNames.get(sid) ?? sid })
    }
  }

  return { teacherConflicts, studentConflicts, conflictLessonIds }
}
