'use client'

import { useState, useTransition } from 'react'

interface Props {
  studentId: string
  studentName: string
  grade: string
  subjects: string[]
}

type TabId = 'parent' | 'recommendation' | 'comparison'

export function StudentAIPanel({ studentId, studentName, grade, subjects }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('parent')

  return (
    <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border border-violet-100 dark:border-violet-900 rounded-2xl p-5 mt-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200 px-1.5 py-0.5 rounded font-bold">AI生成</span>
        <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-200">AIアシスト</h3>
      </div>

      <div className="flex gap-1 mb-4 border-b border-violet-100 dark:border-violet-900">
        {([
          { id: 'parent' as const, label: '保護者メッセージ' },
          { id: 'recommendation' as const, label: '講習提案' },
          { id: 'comparison' as const, label: '同学年比較' },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-800 text-violet-700 dark:text-violet-300 border border-b-0 border-violet-200 dark:border-violet-800'
                : 'text-gray-500 dark:text-gray-400 hover:text-violet-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'parent' && (
        <ParentMessagePanel studentName={studentName} grade={grade} />
      )}
      {activeTab === 'recommendation' && (
        <RecommendationPanel studentName={studentName} grade={grade} subjects={subjects} />
      )}
      {activeTab === 'comparison' && (
        <ComparisonPanel studentId={studentId} grade={grade} />
      )}
    </div>
  )
}

function ParentMessagePanel({ studentName, grade }: { studentName: string; grade: string }) {
  const [context, setContext] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function handleGenerate() {
    if (!context.trim()) return
    setError(null)
    setResult(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/ai/parent-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentName, grade, context }),
        })
        const data = await res.json() as { message?: string; error?: string }
        if (!res.ok || data.error) { setError(data.error ?? 'エラー'); return }
        setResult(data.message ?? '')
      } catch { setError('通信エラー') }
    })
  }

  function handleCopy() {
    if (!result) return
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">連絡帳やメール向けの保護者へのお知らせ文下書きを生成します</p>
      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        rows={3}
        placeholder="例: 先日の模試で数学が伸びたので報告したい / 欠席が続いているので声掛けをお願いしたい"
        className="w-full text-sm border border-violet-200 dark:border-violet-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={handleGenerate}
        disabled={isPending || !context.trim()}
        className="px-4 py-1.5 text-sm bg-violet-600 dark:bg-violet-700 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? '生成中…' : '文章を生成'}
      </button>
      {result && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-violet-100 dark:border-violet-800 p-4">
          <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{result}</p>
          <button
            onClick={handleCopy}
            className="mt-2 text-xs text-violet-600 dark:text-violet-400 hover:underline"
          >
            {copied ? 'コピーしました!' : 'クリップボードにコピー'}
          </button>
        </div>
      )}
    </div>
  )
}

function RecommendationPanel({ studentName, grade, subjects }: { studentName: string; grade: string; subjects: string[] }) {
  const [reason, setReason] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      try {
        const context = `${studentName}（${grade}）が受講している科目: ${subjects.join('、') || 'なし'}。追加の講習や夏期講習の受講を提案する際の根拠と推薦文を作成してください。`
        const res = await fetch('/api/ai/parent-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentName, grade, context }),
        })
        const data = await res.json() as { message?: string; error?: string }
        if (!res.ok || data.error) { setError(data.error ?? 'エラー'); return }
        setReason(data.message ?? '')
      } catch { setError('通信エラー') }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">現在の受講状況を元に、講習・追加授業の提案根拠文を生成します</p>
      <div className="text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-violet-100 dark:border-violet-800">
        受講科目: {subjects.length > 0 ? subjects.join('・') : '未設定'}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={handleGenerate}
        disabled={isPending}
        className="px-4 py-1.5 text-sm bg-violet-600 dark:bg-violet-700 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? '生成中…' : '提案文を生成'}
      </button>
      {reason && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-violet-100 dark:border-violet-800 p-4">
          <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{reason}</p>
        </div>
      )}
    </div>
  )
}

function ComparisonPanel({ studentId, grade }: { studentId: string; grade: string }) {
  const [result, setResult] = useState<{ comment: string; ownRate: number; avgRate: number } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleFetch() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/ai/grade-comparison?studentId=${studentId}`)
        const data = await res.json() as { comment?: string; ownRate?: number; avgRate?: number; error?: string }
        if (!res.ok || data.error) { setError(data.error ?? 'エラー'); return }
        setResult({ comment: data.comment ?? '', ownRate: data.ownRate ?? 0, avgRate: data.avgRate ?? 0 })
      } catch { setError('通信エラー') }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">同学年（{grade}）の出席率と比較した匿名統計とAIコメントを表示します</p>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={handleFetch}
        disabled={isPending}
        className="px-4 py-1.5 text-sm bg-violet-600 dark:bg-violet-700 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? '取得中…' : '比較を表示'}
      </button>
      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-violet-100 dark:border-violet-800 p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">この生徒の出席率</p>
              <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">{result.ownRate}%</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-violet-100 dark:border-violet-800 p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">{grade} 平均出席率</p>
              <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">{result.avgRate}%</p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-violet-100 dark:border-violet-800 p-4">
            <p className="text-[10px] text-violet-500 dark:text-violet-400 font-bold mb-1">AIコメント</p>
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{result.comment}</p>
          </div>
        </div>
      )}
    </div>
  )
}
