import { REGULAR_SLOTS, INTENSIVE_SLOTS, GROUP_SATURDAY_SLOTS, SATURDAY_INDIVIDUAL_SLOTS } from '@/lib/constants/timeSlots'
import { toDateStr } from '@/lib/utils/datetime'
import type { Lesson, TermPeriod } from '@/types'

// 指定月の特定曜日の日付一覧を返す（dayOfWeek: 1=月〜6=土）
export function getDatesForDayOfWeek(year: number, month: number, dayOfWeek: number): Date[] {
  const dates: Date[] = []
  const date = new Date(year, month - 1, 1)
  while (date.getMonth() === month - 1) {
    if (date.getDay() === (dayOfWeek === 7 ? 0 : dayOfWeek)) dates.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }
  return dates
}

// ある日付の期間区分を返す
export function getTermTypeForDate(
  dateStr: string,
  termPeriods: Pick<TermPeriod, 'start_date' | 'end_date' | 'type'>[]
): 'regular' | 'intensive' {
  const match = termPeriods.find((t) => t.start_date <= dateStr && t.end_date >= dateStr)
  return match?.type ?? 'regular'
}

// コマと月から、その月の実際の授業日程（日付×コマ）を展開する
export function expandLessonsForMonth(
  lessons: Lesson[],
  year: number,
  month: number,
  termPeriods: TermPeriod[]
): { date: Date; dateStr: string; lesson: Lesson; timeLabel: string }[] {
  const result: { date: Date; dateStr: string; lesson: Lesson; timeLabel: string }[] = []

  for (const lesson of lessons) {
    // 臨時コマ（特定日のみ）: その日付が対象月に含まれる場合だけ1件展開する
    if (lesson.lesson_kind === 'temporary' || lesson.specific_date) {
      const ds = lesson.specific_date
      if (!ds) continue
      const d = new Date(`${ds}T12:00:00`)
      if (d.getFullYear() !== year || d.getMonth() !== month - 1) continue
      const termType = getTermTypeForDate(ds, termPeriods)
      const slots =
        termType === 'intensive' ? INTENSIVE_SLOTS
        : lesson.day_of_week === 6 && lesson.type === 'group' ? GROUP_SATURDAY_SLOTS
        : lesson.day_of_week === 6 ? SATURDAY_INDIVIDUAL_SLOTS
        : REGULAR_SLOTS
      const slot = slots.find((s) => s.index === lesson.slot_index)
      result.push({ date: d, dateStr: ds, lesson, timeLabel: slot ? `${slot.start}〜${slot.end}` : '' })
      continue
    }

    const dates = getDatesForDayOfWeek(year, month, lesson.day_of_week)
    for (const date of dates) {
      const dateStr = toDateStr(date)
      const termType = getTermTypeForDate(dateStr, termPeriods)
      if (lesson.term_type !== termType) continue

      const slots =
        termType === 'intensive' ? INTENSIVE_SLOTS
        : lesson.day_of_week === 6 && lesson.type === 'group' ? GROUP_SATURDAY_SLOTS
        : lesson.day_of_week === 6 ? SATURDAY_INDIVIDUAL_SLOTS
        : REGULAR_SLOTS

      const slot = slots.find((s) => s.index === lesson.slot_index)
      const timeLabel = slot ? `${slot.start}〜${slot.end}` : ''

      result.push({ date, dateStr, lesson, timeLabel })
    }
  }

  return result.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.lesson.slot_index - b.lesson.slot_index)
}
