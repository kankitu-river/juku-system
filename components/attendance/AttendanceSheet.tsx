'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  recordAttendance,
  markAbsentWithCredit,
  markAbsentNoCredit,
} from '@/app/(dashboard)/attendance/actions'

type Status = 'present' | 'absent' | 'makeup_used' | null

interface Student {
  id: string
  name: string
  grade: string
}

interface AttendanceEntry {
  studentId: string
  studentName: string
  studentGrade: string
  currentStatus: Status
}

interface AttendanceSheetProps {
  lessonId: string
  date: string
  entries: AttendanceEntry[]
}

interface MakeupDialog {
  studentId: string
  studentName: string
}

const STATUS_CONFIG = {
  present: { label: '出席', color: 'bg-green-100 text-green-800 border-green-300', icon: '○' },
  absent: { label: '欠席', color: 'bg-red-100 text-red-800 border-red-300', icon: '×' },
  makeup_used: { label: '振替', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: '◎' },
} as const

export function AttendanceSheet({ lessonId, date, entries: initialEntries }: AttendanceSheetProps) {
  const router = useRouter()
  const [entries, setEntries] = useState(initialEntries)
  const [makeupDialog, setMakeupDialog] = useState<MakeupDialog | null>(null)
  const [isPending, startTransition] = useTransition()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  function updateLocalStatus(studentId: string, status: Status) {
    setEntries((prev) =>
      prev.map((e) => e.studentId === studentId ? { ...e, currentStatus: status } : e)
    )
  }

  function handlePresent(studentId: string) {
    setLoadingId(studentId)
    startTransition(async () => {
      await recordAttendance(studentId, lessonId, date, 'present')
      updateLocalStatus(studentId, 'present')
      setLoadingId(null)
    })
  }

  function handleAbsentClick(studentId: string, studentName: string) {
    setMakeupDialog({ studentId, studentName })
  }

  function handleAbsentWithCredit() {
    if (!makeupDialog) return
    const { studentId } = makeupDialog
    setMakeupDialog(null)
    setLoadingId(studentId)
    startTransition(async () => {
      await markAbsentWithCredit(studentId, lessonId, date)
      updateLocalStatus(studentId, 'absent')
      setLoadingId(null)
      router.refresh()
    })
  }

  function handleAbsentNoCredit() {
    if (!makeupDialog) return
    const { studentId } = makeupDialog
    setMakeupDialog(null)
    setLoadingId(studentId)
    startTransition(async () => {
      await markAbsentNoCredit(studentId, lessonId, date)
      updateLocalStatus(studentId, 'absent')
      setLoadingId(null)
    })
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        このコマに生徒が登録されていません
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {entries.map((entry) => {
          const isLoading = loadingId === entry.studentId
          const status = entry.currentStatus

          return (
            <div
              key={entry.studentId}
              className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 px-5 py-3 shadow-sm"
            >
              {/* 生徒情報 */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{entry.studentName}</p>
                <p className="text-xs text-gray-400">{entry.studentGrade}</p>
              </div>

              {/* 現在のステータス */}
              {status && (
                <span className={[
                  'text-xs font-medium px-2.5 py-1 rounded-full border',
                  STATUS_CONFIG[status].color,
                ].join(' ')}>
                  {STATUS_CONFIG[status].icon} {STATUS_CONFIG[status].label}
                </span>
              )}

              {/* 出席/欠席ボタン */}
              <div className="flex gap-2 flex-shrink-0">
                <button
                  disabled={isLoading || status === 'present'}
                  onClick={() => handlePresent(entry.studentId)}
                  className={[
                    'min-w-[64px] px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                    status === 'present'
                      ? 'bg-green-500 text-white border-green-500'
                      : 'bg-white text-green-700 border-green-300 hover:bg-green-50',
                    isLoading ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  出席
                </button>
                <button
                  disabled={isLoading || status === 'absent'}
                  onClick={() => handleAbsentClick(entry.studentId, entry.studentName)}
                  className={[
                    'min-w-[64px] px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                    status === 'absent'
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-red-600 border-red-300 hover:bg-red-50',
                    isLoading ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  欠席
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* 振替確認ダイアログ */}
      <Modal
        open={!!makeupDialog}
        onClose={() => setMakeupDialog(null)}
        title="振替について確認"
        size="sm"
      >
        {makeupDialog && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{makeupDialog.studentName}</span>さんを欠席にします。
              <br />
              振替クレジットを追加しますか？
            </p>
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
              「追加する」を選ぶと振替クレジットが1加算され、後から振替コマを割り当てられます。
            </div>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                onClick={handleAbsentWithCredit}
                loading={isPending}
              >
                振替クレジットを追加する
              </Button>
              <Button
                className="w-full"
                variant="secondary"
                onClick={handleAbsentNoCredit}
                loading={isPending}
              >
                追加しない（欠席のみ記録）
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
