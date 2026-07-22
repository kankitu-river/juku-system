'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { upsertShift, deleteShift, getShiftImpact, type ShiftImpact } from '@/app/(dashboard)/shifts/actions'
import { getSlotLabel, getSlotsForLesson } from '@/lib/constants/timeSlots'
import type { Lesson } from '@/types'

interface ShiftInfo {
  id?: string
  start_time: string
  end_time: string
}

interface ShiftModalProps {
  open: boolean
  onClose: () => void
  teacherId: string
  teacherName: string
  date: string           // YYYY-MM-DD
  dateLabel: string      // 表示用
  existing?: ShiftInfo
  lessons: Lesson[]      // その先生のその曜日のコマ
  onSaved: () => void
}

// コマの時間帯を表示
function lessonTimeLabel(lesson: Lesson): string {
  return getSlotLabel(lesson.slot_index, lesson.day_of_week, lesson.term_type, lesson.type)
}

// シフト時間がコマをカバーしているか確認
function isLessonCovered(lesson: Lesson, startTime: string, endTime: string): boolean {
  const slotLabel = lessonTimeLabel(lesson)
  if (!slotLabel) return false
  const [slotStart, slotEnd] = slotLabel.split('〜')
  return startTime <= slotStart && endTime >= slotEnd
}

export function ShiftModal({
  open, onClose, teacherId, teacherName, date, dateLabel,
  existing, lessons, onSaved,
}: ShiftModalProps) {
  const [startTime, setStartTime] = useState(existing?.start_time ?? '16:00')
  const [endTime, setEndTime] = useState(existing?.end_time ?? '21:30')
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const [error, setError] = useState<string>()
  const [impactState, setImpactState] = useState<null | 'loading' | ShiftImpact>(null)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (startTime >= endTime) {
      setError('終了時刻は開始時刻より後にしてください')
      return
    }
    setError(undefined)
    startTransition(async () => {
      const result = await upsertShift({ teacher_id: teacherId, date, start_time: startTime, end_time: endTime })
      if (result.error) { setError(result.error); return }
      onSaved()
      onClose()
    })
  }

  function handleDeleteClick() {
    if (!existing?.id) return
    setImpactState('loading')
    getShiftImpact(teacherId, date).then((data) => setImpactState(data)).catch(() => setImpactState({ affectedStudents: [], lessonCount: 0 }))
  }

  function confirmDelete() {
    if (!existing?.id) return
    setImpactState(null)
    startDeleting(async () => {
      const result = await deleteShift(existing.id!)
      if (result.error) { setError(result.error); return }
      onSaved()
      onClose()
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={`${teacherName}のシフト`} size="sm">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{dateLabel}</p>

      {/* この日のコマ一覧 */}
      {lessons.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">この曜日のコマ</p>
          <ul className="space-y-1">
            {lessons.map((lesson) => {
              const label = lessonTimeLabel(lesson)
              const covered = isLessonCovered(lesson, startTime, endTime)
              return (
                <li key={lesson.id} className="flex items-center gap-2 text-xs">
                  <span className={covered ? 'text-green-500' : 'text-red-400'}>
                    {covered ? '✓' : '!'}
                  </span>
                  <Link
                    href={`/schedule/${lesson.id}`}
                    className="text-gray-700 dark:text-gray-300 hover:text-navy hover:underline"
                  >
                    第{lesson.slot_index}コマ　{lesson.teacher?.name ? `${lesson.teacher.name}先生` : '担当未設定'}　{label}
                    <span className="ml-1 text-gray-400 text-[10px]">
                      {lesson.term_type === 'intensive' ? '（講習）' : '（通常）'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* 削除影響確認パネル */}
      {impactState !== null && (
        <div className="mb-4 rounded-lg border p-3 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900">
          {impactState === 'loading' ? (
            <p className="text-sm text-gray-500">影響を確認中...</p>
          ) : (
            <>
              {impactState.affectedStudents.length > 0 ? (
                <>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">
                    ⚠ このシフトを削除すると {impactState.affectedStudents.length}名の生徒に影響が出ます
                  </p>
                  <ul className="space-y-0.5 mb-3 max-h-32 overflow-y-auto">
                    {impactState.affectedStudents.map((s) => (
                      <li key={s.id} className="text-xs text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                        ・{s.name}
                        {s.hasPendingCredits && (
                          <span className="text-[10px] px-1 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-bold">振替残あり</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">影響を受ける受講生徒はいません。</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                >
                  {isDeleting ? '削除中...' : '本当に削除する'}
                </button>
                <button
                  onClick={() => setImpactState(null)}
                  className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  キャンセル
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">開始時刻</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">終了時刻</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isPending}>
              {existing ? '更新' : '登録'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              キャンセル
            </Button>
          </div>
          {existing?.id && !impactState && (
            <Button type="button" size="sm" variant="danger" onClick={handleDeleteClick}>
              削除
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}
