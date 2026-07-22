import { NextResponse } from 'next/server'

// この機能は現在無効です（LLM離脱 M2-4）。将来のLLM再導入時に復活予定。
export async function POST() {
  return NextResponse.json({ error: 'この機能は現在無効です' }, { status: 503 })
}
