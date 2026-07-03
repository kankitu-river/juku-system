'use client'

import { useState, useTransition } from 'react'
import { advanceAllGrades } from '@/app/(dashboard)/students/actions'

export function GradeAdvancement() {
  const [isPending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)
  const [result, setResult] = useState<{ count?: number; skipped?: number; error?: string } | null>(null)

  function handleConfirm() {
    startTransition(async () => {
      const res = await advanceAllGrades()
      setResult(res)
      setShowConfirm(false)
    })
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        登録中の全生徒の学年を1つ進級させます（小1→小2、中3→高1など）。
        高3の生徒はそのまま残ります（手動で削除してください）。
      </p>

      {result && !result.error && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          <svg className="w-4 h-4 flex-shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {result.count}名の学年を更新しました
          {(result.skipped ?? 0) > 0 && (
            <span className="text-green-600">（高3 {result.skipped}名はスキップ）</span>
          )}
        </div>
      )}

      {result?.error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {result.error}
        </div>
      )}

      {!showConfirm ? (
        <button
          onClick={() => { setResult(null); setShowConfirm(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-dark transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z" />
          </svg>
          一括進級処理を実行
        </button>
      ) : (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-900">
            全生徒の学年を1つ進めますか？
          </p>
          <p className="text-xs text-amber-700">
            この操作は元に戻せません。実行前にバックアップをお勧めします。
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={isPending}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? '処理中...' : '実行する'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              disabled={isPending}
              className="px-4 py-2 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
