'use client'

import { useState } from 'react'

export function WeeklySummary() {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [week, setWeek] = useState<{ from: string; to: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/weekly-summary')
      const data = await res.json() as { summary?: string; week?: { from: string; to: string }; error?: string }
      if (!res.ok || data.error) { setError(data.error ?? 'エラーが発生しました'); return }
      setSummary(data.summary ?? '')
      setWeek(data.week ?? null)
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border border-violet-100 dark:border-violet-900 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200 px-1.5 py-0.5 rounded font-bold">AI生成</span>
          <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-200">週次サマリー</h3>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="px-3 py-1 text-xs bg-violet-600 dark:bg-violet-700 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '生成中…' : summary ? '再生成' : '生成する'}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {summary ? (
        <div>
          {week && (
            <p className="text-[10px] text-violet-500 dark:text-violet-400 mb-1">
              {week.from} 〜 {week.to}
            </p>
          )}
          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{summary}</p>
        </div>
      ) : !loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500">ボタンを押すと今週のサマリーをAIが生成します</p>
      )}
    </div>
  )
}
