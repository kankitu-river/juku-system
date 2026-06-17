'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { upsertShift, deleteShift } from '@/app/(dashboard)/shifts/actions'
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

  function handleDelete() {
    if (!existing?.id || !confirm('このシフトを削除しますか？')) return
    startDeleting(async () => {
      const result = await deleteShift(existing.id!)
      if (result.error) { setError(result.error); return }
      onSaved()
      onClose()
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={`${teacherName}のシフト`} size="sm">
      <p className="text-sm text-gray-500 mb-4">{dateLabel}</p>

      {/* この日のコマ一覧 */}
      {lessons.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs font-medium text-gray-600 mb-2">この曜日のコマ</p>
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
                    className="text-gray-700 hover:text-[#1E3A5F] hover:underline"
                  >
                    {lesson.subject} {label}
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

      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">開始時刻</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">終了時刻</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
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
          {existing?.id && (
            <Button type="button" size="sm" variant="danger" loading={isDeleting} onClick={handleDelete}>
              削除
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}
