import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClientAsync, AI_MODEL } from '@/lib/ai/client'
import { DB_TOOLS, executeDbTool } from '@/lib/ai/tools/dbTools'
import { answerQuestion } from '@/lib/ai/ruleAssistant'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'

const SYSTEM_ASSISTANT = `あなたは塾のスケジュール管理システムのデータ検索アシスタントです。
管理者・スタッフからの質問に日本語で答えます。

- 利用可能なツールでデータベースを検索し、正確な情報だけを答えてください。
- あなたは読み取り専用です。データの変更・削除・作成はできません。頼まれても「閲覧のみ対応しています」と答えてください。
- 回答は簡潔に。必要なデータのみ、箇条書きで見やすくまとめてください。
- 見つからない場合は素直に「データが見つかりませんでした」と答えてください。`

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAX_TOOL_ROUNDS = 4

// LLMでツール利用ループを回す。ツール呼び出しが続く限り最大 MAX_TOOL_ROUNDS 回まで実行。
async function runLlm(messages: ChatMessage[], supabase: SupabaseClient): Promise<string> {
  const client = await getAnthropicClientAsync()
  const convo: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }))

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      system: SYSTEM_ASSISTANT,
      tools: DB_TOOLS,
      messages: convo,
    })

    if (res.stop_reason !== 'tool_use') {
      return res.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('')
    }

    // ツールを実行して結果を会話に追加
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue
      const result = await executeDbTool(block.name, block.input as Record<string, unknown>, supabase)
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
    }
    convo.push({ role: 'assistant', content: res.content })
    convo.push({ role: 'user', content: toolResults })
  }

  return '検索が長くなりすぎました。質問をもう少し具体的にしてください。'
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

    const { messages } = await req.json() as { messages: ChatMessage[] }
    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: '質問が空です' }, { status: 400 })
    }

    // APIキーがあればLLM、無ければルールベースに自動フォールバック
    try {
      const content = await runLlm(messages, supabase)
      return NextResponse.json({ content, mode: 'llm' })
    } catch {
      // キー未設定などでLLMが使えない場合はルールベースで回答（無料・エラーにしない）
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      const content = await answerQuestion(lastUser?.content ?? '', supabase)
      return NextResponse.json({ content, mode: 'rule' })
    }
  } catch (e) {
    console.error('assistant error:', e)
    return NextResponse.json({ error: '回答の生成に失敗しました' }, { status: 500 })
  }
}
