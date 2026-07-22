import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { answerQuestion } from '@/lib/ai/ruleAssistant'

// LLMは使わず、ルールベースで実データから回答する（M2-4でLLM離脱）。
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

    const { messages } = await req.json() as { messages: { role: string; content: string }[] }
    const lastUser = [...(messages ?? [])].reverse().find((m) => m.role === 'user')
    if (!lastUser?.content) {
      return NextResponse.json({ error: '質問が空です' }, { status: 400 })
    }

    const content = await answerQuestion(lastUser.content, supabase)
    return NextResponse.json({ content })
  } catch (e) {
    console.error('assistant error:', e)
    return NextResponse.json({ error: '回答の生成に失敗しました' }, { status: 500 })
  }
}
