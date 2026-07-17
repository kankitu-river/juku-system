import { NextRequest, NextResponse } from 'next/server'
import { generateJSON } from '@/lib/ai/client'
import { SYSTEM_PARSE_SHIFT } from '@/lib/ai/prompts/parseShiftText'
import { createClient } from '@/lib/supabase/server'

interface ParsedShift {
  available_days: number[]
  time_preference: string
  notes: string
}

export async function POST(req: NextRequest) {
  try {
    // 認証チェック（survey/respond は token 認証なので survey_token を受け取る）
    const { text, token } = await req.json() as { text: string; token?: string }
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

    // token or session 認証
    const supabase = await createClient()
    if (token) {
      const { data } = await supabase.from('shift_survey_tokens').select('id').eq('token', token).limit(1)
      if (!data || data.length === 0) return NextResponse.json({ error: 'invalid token' }, { status: 401 })
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const result = await generateJSON<ParsedShift>(SYSTEM_PARSE_SHIFT, text)
    if (!result) return NextResponse.json({ error: 'AI解析に失敗しました' }, { status: 500 })

    return NextResponse.json(result)
  } catch (e) {
    console.error('AI parse-shift error:', e)
    return NextResponse.json({ error: 'AI呼び出しに失敗しました' }, { status: 500 })
  }
}
