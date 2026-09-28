'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { assignMakeupFromLedger, markAbsentToLedger } from '@/app/(dashboard)/attendance/makeup/ledger/actions'
import { getDisplayGrade } from '@/lib/utils/grade'

interface EnrolledOpt { id: string; name: string; grade?: string; subject?: string }
interface LedgerItem { id: string; studentName: string; subject: string; status: 'pending' | 'scheduled' }
interface ExistingMakeup { id: string; studentName: string; date: string }

interface Props {
  lessonId: string
  fixedDate: string | null // 臨時コマは開催日固定。通常コマは null（日付を選ぶ）
  dayOfWeek: number
  lessonLabel: string // 元授業ラベル（例「第2コマ」）
  enrolled: EnrolledOpt[]
  ledgerItems: LedgerItem[] // 台帳の未消化（未定・決定）
  existingMakeups: ExistingMakeup[]
}

function pad(n: number) { return String(n).padStart(2, '0') }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

// 今日以降で、指定曜日(1=月..6=土)の直近の日付
function nextDateForDow(dow: number): string {
  const today = new Date()
  const cur = today.getDay() === 0 ? 7 : today.getDay()
  let diff = dow - cur
  if (diff < 0) diff += 7
  const d = new Date(today)
  d.setDate(today.getDate() + diff)
  return toDateStr(d)
}

export function LessonMakeupPanel({ lessonId, fixedDate, dayOfWeek, lessonLabel, enrolled, ledgerItems, existingMakeups }: Props) {
  const router = useRouter()
  const [date, setDate] = useState<string>(fixedDate ?? nextDateForDow(dayOfWeek))
  const [ledgerItemId, setLedgerItemId] = useState('')
  const [absentStudentId, setAbsentStudentId] = useState('')
  const [absentConfirm, setAbsentConfirm] = useState<EnrolledOpt | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  function handleAddMakeup() {
    if (!ledgerItemId || !date) return
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await assignMakeupFromLedger(ledgerItemId, lessonId, date)
      if (result.error) { setError(result.error); return }
      const item = ledgerItems.find((i) => i.id === ledgerItemId)
      setMessage(`${item?.studentName ?? '生徒'}さんの振替を${date}に割り当て、台帳を「済」にしました`)
      setLedgerItemId('')
      router.refresh()
    })
  }

  function handleAbsent() {
    if (!absentConfirm || !date) return
    const student = absentConfirm
    setAbsentConfirm(null)
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await markAbsentToLedger({
        studentId: student.id,
        studentName: student.name,
        subject: student.subject ?? '',
        lessonId,
        date,
        originalLabel: `${date}（${lessonLabel}）`,
      })
      if (result.error) { setError(result.error); return }
      setMessage(`${student.name}さんを${date}に欠席とし、振替（未定）を台帳に追加しました`)
      setAbsentStudentId('')
      router.refresh()
    })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
      <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 text-sm">振替・欠席（特定日）</h3>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
      )}
      {message && (
        <div className="mb-3 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 px-3 py-2 text-xs text-green-700 dark:text-green-300">{message}</div>
      )}

      {/* 対象日 */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">対象日</label>
        {fixedDate ? (
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 rounded-lg px-3 py-2">
            {fixedDate}（臨時コマの開催日）
          </div>
        ) : (
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setMessage(undefined); setError(undefined) }}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          />
        )}
      </div>

      {/* 振替で追加（台帳の未消化をこのコマに割り当て） */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">振替で追加（台帳の未消化から）</label>
        <div className="flex gap-2">
          <select
            value={ledgerItemId}
            onChange={(e) => setLedgerItemId(e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="">— 振替を選択 —</option>
            {ledgerItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.studentName}{i.subject ? `・${i.subject}` : ''}（{i.status === 'pending' ? '未定' : '決定'}）
              </option>
            ))}
          </select>
          <Button type="button" onClick={handleAddMakeup} loading={isPending} disabled={!ledgerItemId}>追加</Button>
        </div>
        {ledgerItems.length === 0 && (
          <p className="text-[11px] text-gray-400 mt-1">台帳に未消化の振替がありません</p>
        )}
      </div>

      {/* 欠席→振替へ回す（台帳に未定で追加） */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">欠席にして振替へ回す（受講生徒）</label>
        <div className="flex gap-2">
          <select
            value={absentStudentId}
            onChange={(e) => setAbsentStudentId(e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="">— 生徒を選択 —</option>
            {enrolled.map((s) => (
              <option key={s.id} value={s.id}>
                {s.grade ? `${s.name}（${getDisplayGrade(s.grade)}）` : s.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const s = enrolled.find((x) => x.id === absentStudentId)
              if (s) setAbsentConfirm(s)
            }}
            disabled={!absentStudentId}
          >
            欠席
          </Button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">選んだ日に欠席として記録し、台帳に「未定」の振替を1件追加します</p>
      </div>

      {/* このコマへの振替予定 */}
      {existingMakeups.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">このコマへの振替予定</p>
          <div className="space-y-1">
            {existingMakeups.map((m) => (
              <div key={m.id} className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                <span>{m.studentName}</span>
                <span className="text-[10px] text-gray-400">{m.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!absentConfirm} onClose={() => setAbsentConfirm(null)} title="欠席・振替の確認" size="sm">
        {absentConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{absentConfirm.name}</span>さんを
              <span className="font-semibold"> {date} </span>
              に欠席として記録し、台帳に「未定」の振替を1件追加します。よろしいですか？
            </p>
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={handleAbsent} loading={isPending}>欠席にして振替を台帳へ追加</Button>
              <Button className="w-full" variant="ghost" onClick={() => setAbsentConfirm(null)}>キャンセル</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
