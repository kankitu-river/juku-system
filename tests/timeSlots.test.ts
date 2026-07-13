import { describe, it, expect } from 'vitest'
import {
  getSlotsForLesson, getSlotLabel, getIntensiveSlotsForDay,
  REGULAR_SLOTS, SATURDAY_INDIVIDUAL_SLOTS, GROUP_SATURDAY_SLOTS, INTENSIVE_SLOTS,
} from '@/lib/constants/timeSlots'

describe('getSlotsForLesson', () => {
  it('平日個別はREGULAR_SLOTS', () => {
    expect(getSlotsForLesson('individual', 2, 'regular')).toEqual(REGULAR_SLOTS)
  })
  it('土曜個別はSATURDAY_INDIVIDUAL_SLOTS', () => {
    expect(getSlotsForLesson('individual', 6, 'regular')).toEqual(SATURDAY_INDIVIDUAL_SLOTS)
  })
  it('土曜集団はGROUP_SATURDAY_SLOTS', () => {
    expect(getSlotsForLesson('group', 6, 'regular')).toEqual(GROUP_SATURDAY_SLOTS)
  })
  it('講習期は曜日によらずINTENSIVE_SLOTS（limitsなし）', () => {
    expect(getSlotsForLesson('individual', 6, 'intensive')).toEqual(INTENSIVE_SLOTS)
  })
  it('講習期limitsで曜日別に最終コマを制限', () => {
    expect(getIntensiveSlotsForDay(6, { '6': 4 })).toHaveLength(4)
    expect(getIntensiveSlotsForDay(2, { '6': 4 })).toEqual(INTENSIVE_SLOTS)
  })
})

describe('getSlotLabel', () => {
  it('平日個別 第2コマ', () => {
    expect(getSlotLabel(2, 1, 'regular')).toBe('18:10〜19:40')
  })
  it('該当なしは空文字', () => {
    expect(getSlotLabel(9, 1, 'regular')).toBe('')
  })
})
