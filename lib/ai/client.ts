import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

// Claude API クライアント（サーバーサイド専用）
// env → DB の順でAPIキーを解決する
export async function getAnthropicClientAsync(): Promise<Anthropic> {
  const envKey = process.env.ANTHROPIC_API_KEY
  if (envKey) return new Anthropic({ apiKey: envKey })

  const supabase = await createClient()
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'anthropic_api_key')
    .single()
  // JSONB で保存された文字列は JS では string になる
  const raw = data?.value
  const dbKey = typeof raw === 'string' ? raw : null
  if (!dbKey) throw new Error('ANTHROPIC_API_KEY が設定されていません（設定画面で登録してください）')
  return new Anthropic({ apiKey: dbKey })
}

// 後方互換のため同期版も残す（env 専用）
export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません')
  return new Anthropic({ apiKey })
}

export const AI_MODEL = 'claude-haiku-4-5-20251001'  // コスト効率重視; 高品質が必要な場合は claude-sonnet-4-6

export interface AITextResult {
  text: string
  usage: { inputTokens: number; outputTokens: number }
}

// 単発テキスト生成（非ストリーミング）
export async function generateText(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1024
): Promise<AITextResult> {
  const client = await getAnthropicClientAsync()
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
  return {
    text,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  }
}

// JSON を返す生成（parseエラー時は null）
export async function generateJSON<T>(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 512
): Promise<T | null> {
  try {
    const result = await generateText(systemPrompt, userMessage, maxTokens)
    const jsonMatch = result.text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as T
  } catch {
    return null
  }
}
