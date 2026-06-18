import type { TimeSlot } from '@/types'

// 月〜金 個別指導
export const REGULAR_SLOTS: TimeSlot[] = [
  { index: 1, start: '16:30', end: '18:00' },
  { index: 2, start: '18:10', end: '19:40' },
  { index: 3, start: '19:50', end: '21:20' },
]

// 講習期間（全曜日共通）
export const INTENSIVE_SLOTS: TimeSlot[] = [
  { index: 1, start: '09:30', end: '11:00' },
  { index: 2, start: '11:10', end: '12:40' },
  { index: 3, start: '13:10', end: '14:40' },
  { index: 4, start: '14:50', end: '16:20' },
  { index: 5, start: '16:30', end: '18:00' },
  { index: 6, start: '18:10', end: '19:40' },
  { index: 7, start: '19:50', end: '21:20' },
]

// 土曜 個別指導（19:40で終了）
export const SATURDAY_INDIVIDUAL_SLOTS: TimeSlot[] = [
  { index: 1, start: '13:10', end: '14:40' },
  { index: 2, start: '14:50', end: '16:20' },
  { index: 3, start: '16:30', end: '18:00' },
  { index: 4, start: '18:10', end: '19:40' },
]

// 土曜 集団授業
export const GROUP_SATURDAY_SLOTS: TimeSlot[] = [
  { index: 1, start: '16:30', end: '17:30' },
  { index: 2, start: '17:40', end: '18:40' },
  { index: 3, start: '18:50', end: '19:50' },
]

export const DAYS_OF_WEEK = [
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' },
]

export const SUBJECTS = [
  '数学', '英語', '国語', '理科', '社会',
  '物理', '化学', '生物', '日本史', '世界史', '地理', '小論文',
  '古典', '算数', '国算', '英数', '数国', '国数', 'テスト対策',
]

// dayOfWeek.toString() -> 講習期間での最終コマ番号（未設定の曜日は7）
export type IntensiveSlotLimits = Record<string, number>

export function getIntensiveSlotsForDay(dayOfWeek: number, limits?: IntensiveSlotLimits | null): TimeSlot[] {
  const max = limits?.[String(dayOfWeek)]
  if (!max) return INTENSIVE_SLOTS
  return INTENSIVE_SLOTS.filter((s) => s.index <= max)
}

export function getSlotsForLesson(
  type: 'group' | 'individual',
  dayOfWeek: number,
  termType: 'regular' | 'intensive',
  intensiveLimits?: IntensiveSlotLimits | null
): TimeSlot[] {
  if (termType === 'intensive') return getIntensiveSlotsForDay(dayOfWeek, intensiveLimits)
  if (dayOfWeek === 6 && type === 'group') return GROUP_SATURDAY_SLOTS
  if (dayOfWeek === 6 && type === 'individual') return SATURDAY_INDIVIDUAL_SLOTS
  return REGULAR_SLOTS
}

export function getSlotLabel(
  slotIndex: number,
  dayOfWeek: number,
  termType: 'regular' | 'intensive',
  type: 'group' | 'individual' = 'individual'
): string {
  const slots = getSlotsForLesson(type, dayOfWeek, termType)
  const slot = slots.find((s) => s.index === slotIndex)
  return slot ? `${slot.start}〜${slot.end}` : ''
}
