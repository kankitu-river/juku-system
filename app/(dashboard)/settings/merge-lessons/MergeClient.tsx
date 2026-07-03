'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DuplicateGroup } from './actions'
import { executeMerge } from './actions'
import { Button } from '@/components/ui/Button'

const DOW_NAMES: Record<number, string> = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' }

interface Props {
  groups: DuplicateGroup[]
}

export function MergeClient({ groups }: Props) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ mergedLessons: number; movedEnrollments: number } | null>(null)
  const [error, setError] = useState<string>()

  async function handleMerge() {
    if (!confirm(`${groups.length}グループのコマを統合します。よろしいですか？`)) return
    setRunning(true)
    setError(undefined)
    const res = await executeMerge()
    setRunning(false)
    if (res.error) {
      setError(res.error)
    } else {
      setResult({ mergedLessons: res.mergedLessons, movedEnrollments: res.movedEnrollments })
      router.refresh()
    }
  }

  if (result) {
    return (
      <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-xl p-6">
        <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">統合完了</h3>
        <p className="text-sm text-green-700 dark:text-green-300">{result.mergedLessons}件のコマを削除・統合しました</p>
        <p className="text-sm text-green-700 dark:text-green-300">{result.movedEnrollments}件の生徒割り当てを移動しました</p>
        <p className="text-xs text-green-600 dark:text-green-300 mt-3">スケジュール画面を確認してください</p>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        重複しているコマはありません
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
          {groups.length}グループの重複コマが見つかりました
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300">
          同じ先生・同じ時間帯に複数のコマが登録されています。
          統合すると、各コマの生徒を1つのコマにまとめ、余分なコマを削除します。
          生徒の科目は元のコマの科目が引き継がれます。
        </p>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">統合対象一覧</span>
          <Button onClick={handleMerge} loading={running}>
            すべて統合する
          </Button>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {groups.map((g, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {g.teacherName}先生 — {DOW_NAMES[g.dayOfWeek]}曜 第{g.slotIndex}コマ
                </span>
                <span className="text-[10px] bg-gray-200 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                  {g.termType === 'intensive' ? '講習' : '通常'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {g.lessons.map((l, j) => (
                  <div key={l.id} className={[
                    'text-xs px-2.5 py-1.5 rounded-lg border',
                    j === 0
                      ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900 text-teal-800 dark:text-teal-200'
                      : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300',
                  ].join(' ')}>
                    {j === 0 && <span className="font-bold mr-1">【保持】</span>}
                    {j > 0 && <span className="font-bold mr-1">【削除】</span>}
                    {l.subject || '科目未設定'} / 生徒{l.enrollmentCount}名
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
