import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseMeeting } from '@/lib/parse/meetingParser'

// 日付が過去にならないよう 2099年にフィックス
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2099-01-01'))
})

describe('parseMeeting', () => {
  it('タスク行（・-□）を抽出できる', () => {
    const text = `7/20 定例ミーティング
参加者: 田中・佐藤

・資料を共有する
- スライド修正
□ 議事録を送る
TODO: 次回日程を決める`
    const result = parseMeeting(text)
    expect(result.tasks).toHaveLength(4)
    expect(result.tasks[0].description).toBe('資料を共有する')
    expect(result.tasks[1].description).toBe('スライド修正')
    expect(result.tasks[2].description).toBe('議事録を送る')
    expect(result.tasks[3].description).toBe('次回日程を決める')
  })

  it('★ と 【決定】 で決定事項を抽出できる', () => {
    const text = `★ 来月から料金改定
【決定】 夏期講習の日程は8/1〜8/20
通常業務は継続`
    const result = parseMeeting(text)
    expect(result.decisions).toHaveLength(2)
    expect(result.decisions[0]).toBe('来月から料金改定')
    expect(result.decisions[1]).toBe('夏期講習の日程は8/1〜8/20')
    expect(result.tasks).toHaveLength(0)
  })

  it('@担当者と（期限）を抽出できる', () => {
    const text = `・プリントを印刷する @田中 (8/5)
・保護者にメール @佐藤（8月10日）
・領収書を整理する @山田 (8/20)なるべく早く`
    const result = parseMeeting(text)
    expect(result.tasks).toHaveLength(3)
    expect(result.tasks[0].assignee).toBe('田中')
    expect(result.tasks[0].dueDate).toBe('2099-08-05')
    expect(result.tasks[1].assignee).toBe('佐藤')
    expect(result.tasks[1].dueDate).toBe('2099-08-10')
    expect(result.tasks[2].assignee).toBe('山田')
    expect(result.tasks[2].dueDate).toBe('2099-08-20')
  })

  it('@だけの行もタスクとして拾う', () => {
    const text = `次回勉強会の準備 @佐藤`
    const result = parseMeeting(text)
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].assignee).toBe('佐藤')
    expect(result.tasks[0].dueDate).toBeNull()
  })

  it('決定もタスクも空ならサマリーは本文冒頭', () => {
    const text = `今日は雑談のみ
特に決定事項なし`
    const result = parseMeeting(text)
    expect(result.decisions).toHaveLength(0)
    expect(result.tasks).toHaveLength(0)
    expect(result.summary).toContain('今日は雑談のみ')
  })

  it('サマリーに件数が含まれる', () => {
    const text = `7/22 定例
★ 来期方針決定
・次回資料を準備 @田中
・備品を発注 @佐藤`
    const result = parseMeeting(text)
    expect(result.summary).toContain('決定1件')
    expect(result.summary).toContain('タスク2件')
  })

  it('空テキストは「メモなし」', () => {
    const result = parseMeeting('')
    expect(result.summary).toBe('メモなし')
    expect(result.tasks).toHaveLength(0)
    expect(result.decisions).toHaveLength(0)
  })
})
