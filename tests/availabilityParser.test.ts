import { describe, it, expect } from 'vitest'
import { parseAvailability } from '@/lib/parse/availabilityParser'

describe('parseAvailability', () => {
  // spec 必須の4ケース
  it('火木の夕方なら行けます → [2,4], evening, high', () => {
    const r = parseAvailability('火木の夕方なら行けます')
    expect(r.available_days).toEqual([2, 4])
    expect(r.time_preference).toBe('evening')
    expect(r.confidence).toBe('high')
  })

  it('平日OKです。水曜は無理 → [1,2,4,5]', () => {
    const r = parseAvailability('平日OKです。水曜は無理')
    expect(r.available_days).toEqual([1, 2, 4, 5])
  })

  it('月〜木で → [1,2,3,4]', () => {
    const r = parseAvailability('月〜木で')
    expect(r.available_days).toEqual([1, 2, 3, 4])
  })

  it('いつでも大丈夫 → [], confidence low', () => {
    const r = parseAvailability('いつでも大丈夫')
    expect(r.available_days).toEqual([])
    expect(r.confidence).toBe('low')
  })

  // 追加ケース
  it('火から金まで来られます → [2,3,4,5]', () => {
    const r = parseAvailability('火から金まで来られます')
    expect(r.available_days).toEqual([2, 3, 4, 5])
  })

  it('月・水・金は出勤できます → [1,3,5]', () => {
    const r = parseAvailability('月・水・金は出勤できます')
    expect(r.available_days).toEqual([1, 3, 5])
  })

  it('平日は午前中なら大丈夫です → [1,2,3,4,5], morning', () => {
    const r = parseAvailability('平日は午前中なら大丈夫です')
    expect(r.available_days).toEqual([1, 2, 3, 4, 5])
    expect(r.time_preference).toBe('morning')
  })

  it('平日 → 日曜(0)を含まない', () => {
    const r = parseAvailability('平日は来られます')
    expect(r.available_days).not.toContain(0)
    expect(r.available_days).toEqual([1, 2, 3, 4, 5])
  })

  it('木曜と金曜はNGです → 木金が除外される', () => {
    const r = parseAvailability('平日はOKですが木曜と金曜はNGです')
    expect(r.available_days).toEqual([1, 2, 3])
  })

  it('試験期間のため来られません → [], low', () => {
    const r = parseAvailability('試験期間のため来られません')
    expect(r.available_days).toEqual([])
    expect(r.confidence).toBe('low')
  })

  it('今週のみ授業可能 → [], low（曜日情報なし）', () => {
    const r = parseAvailability('今週のみ授業可能')
    expect(r.available_days).toEqual([])
    expect(r.confidence).toBe('low')
  })

  it('16時以降なら来られます → evening', () => {
    const r = parseAvailability('月水金、16時以降なら来られます')
    expect(r.time_preference).toBe('evening')
    expect(r.available_days).toContain(1)
  })
})
