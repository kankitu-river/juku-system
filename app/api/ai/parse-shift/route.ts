import { NextRequest, NextResponse } from 'next/server'
import { parseAvailability } from '@/lib/parse/availabilityParser'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { text, token } = await req.json() as { text: string; token?: string }
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

    const supabase = await createClient()
    if (token) {
      const { data } = await supabase.from('shift_survey_tokens').select('id').eq('token', token).limit(1)
      if (!data || data.length === 0) return NextResponse.json({ error: 'invalid token' }, { status: 401 })
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    return NextResponse.json(parseAvailability(text))
  } catch (e) {
    console.error('parse-shift error:', e)
    return NextResponse.json({ error: '解析に失敗しました' }, { status: 500 })
  }
}
