import { describe, it, expect } from 'vitest'
import { toDateStr } from '@/lib/utils/datetime'

describe('toDateStr', () => {
  it('formats local date as YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 6, 4))).toBe('2026-07-04')   // 月は0始まり
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')   // ゼロ埋め
  })
})
