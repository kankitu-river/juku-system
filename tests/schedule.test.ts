import { describe, it, expect } from 'vitest'
import { getDatesForDayOfWeek, getTermTypeForDate, expandLessonsForMonth } from '@/lib/utils/schedule'
import { toDateStr } from '@/lib/utils/datetime'
import type { Lesson, TermPeriod } from '@/types'

describe('getDatesForDayOfWeek', () => {
  it('2026年7月の土曜（dayOfWeek=6）は 4,11,18,25', () => {
    expect(getDatesForDayOfWeek(2026, 7, 6).map(toDateStr))
      .toEqual(['2026-07-04', '2026-07-11', '2026-07-18', '2026-07-25'])
  })
})

describe('getTermTypeForDate', () => {
  const periods = [
    { start_date: '2026-07-20', end_date: '2026-08-31', type: 'intensive' },
  ] as TermPeriod[]
  it('期間内はintensive、期間外はregular', () => {
    expect(getTermTypeForDate('2026-07-25', periods)).toBe('intensive')
    expect(getTermTypeForDate('2026-07-10', periods)).toBe('regular')
  })
})

describe('expandLessonsForMonth', () => {
  it('通常期の定期コマが該当曜日ぶん展開され、timeLabelが付く', () => {
    const lesson = {
      id: 'x', day_of_week: 6, slot_index: 1, type: 'individual',
      term_type: 'regular', subject: '数学',
    } as unknown as Lesson
    const out = expandLessonsForMonth([lesson], 2026, 7, [])
    expect(out).toHaveLength(4)                       // 7月の土曜4回
    expect(out[0].dateStr).toBe('2026-07-04')
    expect(out[0].timeLabel).toBe('13:10〜14:40')      // 土曜個別 第1コマ
  })
})
