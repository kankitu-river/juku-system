'use client'

import { useState, useRef, useEffect, useTransition } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const EXAMPLE_QUESTIONS = [
  '振替残数がある生徒を教えて',
  '今週の月曜日のコマ一覧を見せて',
  '今月の出席率はどのくらい？',
  '数学を教えている先生は誰がいる？',
]

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || isPending) return
    const userMsg: Message = { role: 'user', content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setError(null)

    startTransition(async () => {
      try {
        const res = await fetch('/api/ai/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: nextMessages }),
        })
        const data = await res.json() as { content?: string; error?: string }
        if (!res.ok || data.error) {
          setError(data.error ?? '通信エラーが発生しました')
          return
        }
        setMessages((prev) => [...prev, { role: 'assistant', content: data.content ?? '' }])
      } catch {
        setError('通信エラーが発生しました')
      }
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto">
      {/* 機能無効バナー */}
      <div className="mb-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
        <span className="font-semibold">この機能は現在無効化されています。</span>
        AIチャット機能はコスト削減のため停止中です。将来のLLM再導入時に復活予定です。
      </div>
      {/* チャット履歴 */}
      <div className="flex-1 overflow-y-auto space-y-4 py-4 px-1">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              データについて自由に質問してください
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-sm'
              }`}
            >
              {msg.role === 'assistant' && (
                <span className="text-[10px] font-bold text-blue-500 dark:text-blue-400 block mb-1">AI</span>
              )}
              {msg.content}
            </div>
          </div>
        ))}

        {isPending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm rounded-xl px-4 py-2">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 入力欄 */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-3 pb-2">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input) }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例: 振替が残っている生徒を全員表示して"
            className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-700"
            disabled={isPending}
          />
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="px-4 py-2.5 bg-blue-600 dark:bg-blue-700 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            送信
          </button>
        </form>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setError(null) }}
            className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            会話をリセット
          </button>
        )}
      </div>
    </div>
  )
}
