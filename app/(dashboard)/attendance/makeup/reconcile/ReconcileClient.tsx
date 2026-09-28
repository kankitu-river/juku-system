'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { getDisplayGrade } from '@/lib/utils/grade'
import { assignMakeupFromLedger } from '../ledger/actions'
import type { ReconcileCandidate } from '@/lib/utils/makeupReconcile'

export interface ReconcileRow {
  id: string
  studentName: string
  grade: string
  subject: string
  date: string
  desiredRaw: string
  candidates: ReconcileCandidate[]
  autoLessonId: string | null
}

export function ReconcileClient({ rows }: { rows: ReconcileRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [busyId, setBusyId] = useState<string | null>(null)
  // 各行で選択中のコマ（初期値は自動確定候補 or 先頭候補）
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.autoLessonId ?? r.candidates[0]?.lessonId ?? '']))
  )

  const autoRows = useMemo(() => rows.filter((r) => r.autoLessonId), [rows])
  const chooseRows = rows.filter((r) => !r.autoLessonId && r.candidates.length > 0)
  const noneRows = rows.filter((r) => r.candidates.length === 0)

  function assignOne(rowId: string, lessonId: string, date: string, done?: () => void) {
    if (!lessonId) return
    setError(undefined)
    setBusyId(rowId)
    startTransition(async () => {
      const res = await assignMakeupFromLedger(rowId, lessonId, date)
      setBusyId(null)
      if (res.error) { setError(`${res.error}`); return }
      done?.()
      router.refresh()
    })
  }

  function assignAllAuto() {
    setError(undefined)
    startTransition(async () => {
      for (const r of autoRows) {
        const res = await assignMakeupFromLedger(r.id, r.autoLessonId!, r.date)
        if (res.error) { setError(`${r.studentName}: ${res.error}`); break }
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {/* 自動確定できる分 */}
      {autoRows.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              ✅ コマが1つに絞れた分（{autoRows.length}件）
            </h2>
            <Button onClick={assignAllAuto} loading={isPending}>まとめて確定</Button>
          </div>
          <div className="space-y-2">
            {autoRows.map((r) => {
              const c = r.candidates.find((x) => x.lessonId === r.autoLessonId)!
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-100">
                      {r.studentName}<span className="text-xs text-gray-400 ml-1">{getDisplayGrade(r.grade)}</span>
                      {r.subject && <span className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full ml-1.5">{r.subject}</span>}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {r.date}（希望: {r.desiredRaw || '—'}） → <CandLabel c={c} />
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => assignOne(r.id, r.autoLessonId!, r.date)} loading={busyId === r.id}>確定</Button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 複数候補：選ぶ */}
      {chooseRows.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
            🔀 候補が複数（{chooseRows.length}件）— コマを選んで確定
          </h2>
          <div className="space-y-3">
            {chooseRows.map((r) => (
              <div key={r.id} className="border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-800 dark:text-gray-100">
                  {r.studentName}<span className="text-xs text-gray-400 ml-1">{getDisplayGrade(r.grade)}</span>
                  {r.subject && <span className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full ml-1.5">{r.subject}</span>}
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">{r.date}（希望: {r.desiredRaw || '—'}）</span>
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <select
                    value={picked[r.id] ?? ''}
                    onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.value }))}
                    className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-navy"
                  >
                    {r.candidates.map((c) => (
                      <option key={c.lessonId} value={c.lessonId}>
                        {c.teacherName}先生・{c.slotLabel}{c.boothName ? `・${c.boothName}` : ''}{c.subjectMatch ? '（科目一致）' : ''}{c.isPreferred ? '⭐' : ''}{c.isFull ? '（満）' : ''}
                      </option>
                    ))}
                  </select>
                  <Button variant="secondary" onClick={() => assignOne(r.id, picked[r.id], r.date)} loading={busyId === r.id} disabled={!picked[r.id]}>確定</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 該当なし */}
      {noneRows.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">
            ⚠ 該当コマが見つからない（{noneRows.length}件）
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            決定日にコマが無い／時間が合わない／日付の年が違う可能性。台帳で日付を直すか、振替管理で手動割り当てしてください。
          </p>
          <div className="space-y-1">
            {noneRows.map((r) => (
              <div key={r.id} className="text-xs text-gray-600 dark:text-gray-300">
                {r.studentName}（{getDisplayGrade(r.grade)}）・{r.subject || '—'}・{r.date}（希望: {r.desiredRaw || '—'}）
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CandLabel({ c }: { c: ReconcileCandidate }) {
  return (
    <span className="text-gray-700 dark:text-gray-200">
      {c.teacherName}先生・{c.slotLabel}{c.boothName ? `・${c.boothName}` : ''}
      {c.subjectMatch && <span className="text-[10px] bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full ml-1">科目一致</span>}
      {c.isPreferred && <span className="ml-0.5" title="任せたい先生">⭐</span>}
    </span>
  )
}
