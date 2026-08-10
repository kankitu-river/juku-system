import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Supabase無料プランの自動一時停止を防ぐためのキープアライブ。
// Vercel Cron（vercel.json参照）から毎日1回呼ばれ、実テーブルへ軽いクエリを投げて
// DBアクティビティを発生させる。読み取り専用・情報は返さない。
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('booths').select('id').limit(1)
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, ts: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    )
  }
}
