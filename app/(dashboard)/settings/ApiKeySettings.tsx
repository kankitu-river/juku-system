'use client'

import { useState, useTransition } from 'react'
import { saveApiKey } from './actions'

interface Props {
  hasKey: boolean
}

export function ApiKeySettings({ hasKey }: Props) {
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!key.trim()) return
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveApiKey(key.trim())
      if (result?.error) { setError(result.error); return }
      setSaved(true)
      setKey('')
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${hasKey ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${hasKey ? 'bg-green-500' : 'bg-red-400'}`} />
          {hasKey ? 'APIキー設定済み' : 'APIキー未設定'}
        </span>
        {hasKey && (
          <span className="text-xs text-gray-400">AIチャット・週次サマリー・議事録要約が使えます</span>
        )}
      </div>

      <form onSubmit={handleSave} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 pr-10 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
          >
            {show ? '隠す' : '表示'}
          </button>
        </div>
        <button
          type="submit"
          disabled={isPending || !key.trim()}
          className="px-4 py-2 text-sm bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? '保存中…' : '保存'}
        </button>
      </form>

      {saved && <p className="text-xs text-green-600 dark:text-green-400">APIキーを保存しました</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-gray-400">
        Anthropic Console（console.anthropic.com）でキーを発行してください。キーは暗号化せずDBに保存されます。
      </p>
    </div>
  )
}
