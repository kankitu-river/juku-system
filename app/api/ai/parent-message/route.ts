import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText } from '@/lib/ai/client'
import { SYSTEM_PARENT_MESSAGE } from '@/lib/ai/prompts/parentMessage'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { studentName, grade, context } = await req.json() as {
      studentName: string
      grade: string
      context: string
    }

    const userMessage = `生徒名: ${studentName}（${grade}）\n内容: ${context}`
    const result = await generateText(SYSTEM_PARENT_MESSAGE, userMessage, 600)
    return NextResponse.json({ message: result.text })
  } catch (e) {
    console.error('parent-message error:', e)
    return NextResponse.json({ error: '生成に失敗しました' }, { status: 500 })
  }
}
