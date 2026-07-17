'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Booth, Lesson } from '@/types'
import { REGULAR_SLOTS, INTENSIVE_SLOTS } from '@/lib/constants/timeSlots'
import { updateBoothAssignment, updateBoothName, autoAssignBooths } from './actions'

export type LessonWithTeacher = Lesson & { teacher: { name: string } | null }

interface BoothBoardProps {
  booths: Booth[]
  lessons: LessonWithTeacher[]
  currentTermType: 'regular' | 'intensive'
  allBooths: Booth[]
  dateStr: string
  dow: number
}

export function BoothBoard({ booths, lessons, currentTermType, allBooths, dateStr, dow }: BoothBoardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingLesson, setEditingLesson] = useState<string | null>(null)
  const [localAssignments, setLocalAssignments] = useState<Record<string, string | null>>({})
  const [editingBooth, setEditingBooth] = useState<string | null>(null)
  const [editingBoothName, setEditingBoothName] = useState('')
  const [boothNamePending, startBoothNameTransition] = useTransition()
  const [autoAssigning, startAutoAssign] = useTransition()
  const [autoResult, setAutoResult] = useState<string | null>(null)

  function handleAutoAssign() {
    if (!confirm('未割り当てのコマにブースを自動割り当てします。よろしいですか？')) return
    startAutoAssign(async () => {
      const result = await autoAssignBooths(dateStr, dow, currentTermType)
      setAutoResult(result.error ? `エラー: ${result.error}` : `${result.assigned}件のコマにブースを割り当てました`)
      setTimeout(() => { setAutoResult(null); router.refresh() }, 2000)
    })
  }

  const slots = currentTermType === 'intensive' ? INTENSIVE_SLOTS : REGULAR_SLOTS
  const activeBooths = booths.filter((b) => b.is_active)

  function getBoothId(lesson: Lesson): string | null {
    if (lesson.id in localAssignments) return localAssignments[lesson.id]
    return lesson.booth_id
  }

  function getLessonsForBoothAndSlot(boothId: string, slotIndex: number): Lesson[] {
    return lessons.filter((l) => getBoothId(l) === boothId && l.slot_index === slotIndex)
  }

  // 指定スロットでPS1授業が隣接しているかチェック
  // activeBoothsはname順でソート済み。隣接 = index±1
  function isBlockedByPS1(boothIndex: number, slotIndex: number): Lesson | null {
    const checkNeighbors = [boothIndex - 1, boothIndex + 1]
    for (const ni of checkNeighbors) {
      if (ni < 0 || ni >= activeBooths.length) continue
      const neighborBoothId = activeBooths[ni].id
      const neighborLessons = getLessonsForBoothAndSlot(neighborBoothId, slotIndex)
      const ps1Lesson = neighborLessons.find((l) => l.is_ps1)
      if (ps1Lesson) return ps1Lesson
    }
    return null
  }

  function handleBoothNameSave(boothId: string) {
    const name = editingBoothName.trim()
    if (!name) return
    setEditingBooth(null)
    startBoothNameTransition(async () => {
      await updateBoothName(boothId, name)
      router.refresh()
    })
  }

  function handleBoothChange(lessonId: string, newBoothId: string) {
    setLocalAssignments((prev) => ({ ...prev, [lessonId]: newBoothId || null }))
    setEditingLesson(null)
    startTransition(async () => {
      await updateBoothAssignment(lessonId, newBoothId || null)
      router.refresh()
    })
  }

  const totalUsedToday = new Set(lessons.map((l) => getBoothId(l)).filter(Boolean)).size

  return (
    <div className="space-y-5">
      {/* 自動割当ボタン */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleAutoAssign}
          disabled={autoAssigning}
          className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50"
        >
          {autoAssigning ? '割り当て中…' : '自動ブース割り当て'}
        </button>
        {autoResult && (
          <span className="text-sm text-green-600 dark:text-green-400">{autoResult}</span>
        )}
      </div>
      {/* サマリー */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{activeBooths.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">稼働中ブース</p>
        </div>
        <div className="bg-teal-50 dark:bg-teal-950/40 rounded-xl border border-teal-100 shadow-sm px-4 py-3 text-center">
          <p className="text-2xl font-bold text-teal-600 dark:text-teal-300">{totalUsedToday}</p>
          <p className="text-xs text-gray-400 mt-0.5">本日使用中</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-500 dark:text-gray-400">{activeBooths.length - totalUsedToday}</p>
          <p className="text-xs text-gray-400 mt-0.5">空きブース</p>
        </div>
      </div>

      {/* ブース×スロット グリッド */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-200 dark:border-gray-700 bg-navy text-white px-3 py-2 text-left font-medium whitespace-nowrap w-24">
                  ブース
                </th>
                {slots.map((slot) => (
                  <th key={slot.index} className="border border-gray-200 dark:border-gray-700 bg-navy text-white px-2 py-2 text-center font-medium whitespace-nowrap">
                    <div>第{slot.index}コマ</div>
                    <div className="text-[10px] opacity-70">{slot.start}〜{slot.end}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeBooths.map((booth, rowIdx) => (
                <tr key={booth.id} className={rowIdx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900/50'}>
                  <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {editingBooth === booth.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="text"
                          value={editingBoothName}
                          onChange={(e) => setEditingBoothName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleBoothNameSave(booth.id)
                            if (e.key === 'Escape') setEditingBooth(null)
                          }}
                          className="w-20 border border-teal-400 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                        />
                        <button
                          onClick={() => handleBoothNameSave(booth.id)}
                          disabled={boothNamePending}
                          className="text-teal-600 dark:text-teal-300 hover:text-teal-800 text-xs font-bold"
                        >✓</button>
                        <button
                          onClick={() => setEditingBooth(null)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                        >✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <span>{booth.name}</span>
                        <button
                          onClick={() => { setEditingBooth(booth.id); setEditingBoothName(booth.name) }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity text-[11px] ml-1"
                          title="ブース名を変更"
                        >✎</button>
                      </div>
                    )}
                  </td>
                  {slots.map((slot) => {
                    const cellLessons = getLessonsForBoothAndSlot(booth.id, slot.index)
                    const isOccupied = cellLessons.length > 0
                    const hasPS1 = cellLessons.some((l) => l.is_ps1)
                    const blockedBy = !isOccupied ? isBlockedByPS1(rowIdx, slot.index) : null
                    return (
                      <td
                        key={slot.index}
                        className={[
                          'border border-gray-200 dark:border-gray-700 px-2 py-1.5 align-top',
                          hasPS1 ? 'bg-purple-50 dark:bg-purple-950/40' : isOccupied ? 'bg-teal-50 dark:bg-teal-950/40' : blockedBy ? 'bg-orange-50 dark:bg-orange-950/40' : '',
                        ].join(' ')}
                        style={{ minWidth: '130px', minHeight: '52px' }}
                      >
                        {cellLessons.map((lesson) => (
                          <div key={lesson.id} className="mb-1">
                            {editingLesson === lesson.id ? (
                              <div className={[
                                'rounded border p-1.5 space-y-1',
                                lesson.is_ps1 ? 'border-purple-300 dark:border-purple-800 bg-white dark:bg-gray-800' : 'border-teal-300 dark:border-teal-800 bg-white dark:bg-gray-800',
                              ].join(' ')}>
                                <div className="flex items-center gap-1">
                                  <p className={[
                                    'font-semibold truncate',
                                    lesson.is_ps1 ? 'text-purple-900' : 'text-teal-900',
                                  ].join(' ')}>{lesson.teacher?.name ? `${(lesson as any).teacher.name}先生` : '担当未設定'}</p>
                                  {lesson.is_ps1 && (
                                    <span className="text-[9px] bg-purple-200 text-purple-800 dark:text-purple-200 px-1 py-0.5 rounded font-bold flex-shrink-0">PS1</span>
                                  )}
                                </div>
                                <select
                                  autoFocus
                                  defaultValue={getBoothId(lesson) ?? ''}
                                  onChange={(e) => handleBoothChange(lesson.id, e.target.value)}
                                  disabled={isPending}
                                  className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5"
                                >
                                  <option value="">— 未割り当て —</option>
                                  {allBooths.filter((b) => b.is_active).map((b) => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => setEditingLesson(null)}
                                  className="text-[10px] text-gray-400 hover:text-gray-600"
                                >
                                  キャンセル
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditingLesson(lesson.id)}
                                className={[
                                  'w-full text-left rounded px-1.5 py-1 border transition-colors',
                                  lesson.is_ps1
                                    ? 'bg-purple-100 dark:bg-purple-900/60 border-purple-200 dark:border-purple-900 hover:bg-purple-200'
                                    : 'bg-teal-100 dark:bg-teal-900/60 border-teal-200 dark:border-teal-900 hover:bg-teal-200',
                                ].join(' ')}
                              >
                                <div className="flex items-center gap-1">
                                  <p className={[
                                    'font-semibold truncate',
                                    lesson.is_ps1 ? 'text-purple-900' : 'text-teal-900',
                                  ].join(' ')}>{lesson.teacher?.name ? `${(lesson as any).teacher.name}先生` : '担当未設定'}</p>
                                  {lesson.is_ps1 && (
                                    <span className="text-[9px] bg-purple-300 text-purple-900 px-1 py-0.5 rounded font-bold flex-shrink-0">PS1</span>
                                  )}
                                </div>
                                <p className={[
                                  'text-[10px]',
                                  lesson.is_ps1 ? 'text-purple-600 dark:text-purple-300' : 'text-teal-600 dark:text-teal-300',
                                ].join(' ')}>
                                  {(lesson.enrollments?.length ?? 0)}/{lesson.capacity}名
                                  <span className="ml-1 opacity-60">✎</span>
                                </p>
                              </button>
                            )}
                          </div>
                        ))}
                        {!isOccupied && blockedBy && (
                          <div className="h-8 flex items-center justify-center gap-1 text-orange-500 text-[10px]">
                            <span>🚫</span>
                            <span>PS1隣席</span>
                          </div>
                        )}
                        {!isOccupied && !blockedBy && (
                          <div className="h-8 flex items-center justify-center">
                            <span className="text-gray-200">—</span>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-400 px-4 py-2 border-t border-gray-100 dark:border-gray-700">
          コマをクリックするとブースを変更できます
        </p>
      </div>

      {/* ブース未割り当てのコマ */}
      {(() => {
        const unassigned = lessons.filter((l) => !getBoothId(l))
        if (!unassigned.length) return null
        return (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">⚠ ブース未割り当てのコマ</p>
            <div className="flex flex-wrap gap-2">
              {unassigned.map((l) => (
                <Link
                  key={l.id}
                  href={`/schedule/${l.id}`}
                  className="text-xs bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-900 rounded-lg px-2.5 py-1.5 text-amber-800 dark:text-amber-200 hover:border-amber-400 transition-colors"
                >
                  第{l.slot_index}コマ {l.subject}
                  {l.teacher?.name && ` (${(l as any).teacher.name})`}
                </Link>
              ))}
            </div>
          </div>
        )
      })()}

      {/* 非稼働ブース */}
      {booths.filter((b) => !b.is_active).length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-2">非稼働ブース</p>
          <div className="flex flex-wrap gap-2">
            {booths.filter((b) => !b.is_active).map((b) => (
              <span key={b.id} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-400 px-3 py-1.5 rounded-full">{b.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
