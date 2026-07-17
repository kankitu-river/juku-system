import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClientAsync, AI_MODEL } from '@/lib/ai/client'
import { DB_TOOLS, executeDbTool } from '@/lib/ai/tools/dbTools'
import type Anthropic from '@anthropic-ai/sdk'

const SYSTEM_ASSISTANT = `あなたは塾のスケジュール管理システムのAIアシスタントです。
管理者からの質問に日本語で答えてください。

利用可能なツールを使ってデータベースを検索し、正確な情報を提供してください。
回答は簡潔にまとめ、必要なデータのみ表示してください。
不明点があれば素直に「データが見つかりませんでした」と答えてください。`

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { messages } = await req.json() as { messages: ChatMessage[] }
    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'messages is required' }, { status: 400 })
    }

    const client = await getAnthropicClientAsync()
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // 1回目: AI がツール呼び出しを決定
    const response1 = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      system: SYSTEM_ASSISTANT,
      tools: DB_TOOLS,
      messages: anthropicMessages,
    })

    // ツール呼び出しがなければそのまま返す
    if (response1.stop_reason !== 'tool_use') {
      const text = response1.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('')
      return NextResponse.json({ content: text })
    }

    // ツール呼び出し実行
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of response1.content) {
      if (block.type !== 'tool_use') continue
      const result = await executeDbTool(
        block.name,
        block.input as Record<string, unknown>,
        supabase
      )
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
    }

    // 2回目: ツール結果を渡して最終回答
    const response2 = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      system: SYSTEM_ASSISTANT,
      tools: DB_TOOLS,
      messages: [
        ...anthropicMessages,
        { role: 'assistant', content: response1.content },
        { role: 'user', content: toolResults },
      ],
    })

    const finalText = response2.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    return NextResponse.json({ content: finalText })
  } catch (e) {
    console.error('AI assistant error:', e)
    return NextResponse.json({ error: 'AI呼び出しに失敗しました' }, { status: 500 })
  }
}
