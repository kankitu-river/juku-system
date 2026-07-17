import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText } from '@/lib/ai/client'
import { SYSTEM_WEEKLY_SUMMARY } from '@/lib/ai/prompts/weeklySummary'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const today = new Date()
    const dayOfWeek = today.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    const fromStr = monday.toISOString().slice(0, 10)
    const toStr = sunday.toISOString().slice(0, 10)

    const [{ data: attendances }, { data: shifts }] = await Promise.all([
      supabase
        .from('attendances')
        .select('status')
        .gte('date', fromStr)
        .lte('date', toStr),
      supabase
        .from('shifts')
        .select('teacher_id')
        .gte('date', fromStr)
        .lte('date', toStr),
    ])

    const total = attendances?.length ?? 0
    const present = attendances?.filter((a) => a.status === 'present').length ?? 0
    const absent = attendances?.filter((a) => a.status === 'absent').length ?? 0
    const makeup = attendances?.filter((a) => a.status === 'makeup_used').length ?? 0
    const activeTeachers = new Set(shifts?.map((s) => s.teacher_id) ?? []).size

    const userMessage = `今週（${fromStr}〜${toStr}）のデータ:
- 出席記録総数: ${total}件
- 出席: ${present}件、欠席: ${absent}件、振替利用: ${makeup}件
- 出席率: ${total > 0 ? Math.round((present / total) * 100) : 0}%
- シフトに入った先生の数: ${activeTeachers}名`

    const result = await generateText(SYSTEM_WEEKLY_SUMMARY, userMessage, 300)
    return NextResponse.json({ summary: result.text, week: { from: fromStr, to: toStr } })
  } catch (e) {
    console.error('weekly-summary error:', e)
    return NextResponse.json({ error: '生成に失敗しました' }, { status: 500 })
  }
}
