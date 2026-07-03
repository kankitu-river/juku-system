'use client'

import { useState, useTransition, useRef } from 'react'
import { INTENSIVE_SLOTS, type IntensiveSlotLimits } from '@/lib/constants/timeSlots'
import { toggleSlotAvailability, setDayAvailability, saveStudentNotes } from './actions'
import { getDisplayGrade } from '@/lib/utils/grade'

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

interface Student {
  id: string
  name: string
  grade: string
}

interface AvailabilityEditorProps {
  students: Student[]
  termPeriodId: string
  termPeriodName: string
  dates: string[]
  initialAvailability: Record<string, string[]>  // studentId -> ["date__slot", ...]
  initialNotes: Record<string, string>            // studentId -> notes
  slotLimits?: IntensiveSlotLimits | null
}

export function AvailabilityEditor({
  students,
  termPeriodId,
  termPeriodName,
  dates,
  initialAvailability,
  initialNotes,
  slotLimits,
}: AvailabilityEditorProps) {
  const [isPending, startTransition] = useTransition()
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(students[0]?.id ?? null)
  const [studentSearch, setStudentSearch] = useState('')

  // studentId -> Set<"date__slotIndex">
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, Set<string>>>(() => {
    const map: Record<string, Set<string>> = {}
    for (const [sid, keys] of Object.entries(initialAvailability)) {
      map[sid] = new Set(keys)
    }
    return map
  })

  const [notesMap, setNotesMap] = useState<Record<string, string>>(initialNotes)
  const [notesSaving, setNotesSaving] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedStudent = students.find((s) => s.id === selectedStudentId)
  const availability = selectedStudentId ? (availabilityMap[selectedStudentId] ?? new Set()) : new Set<string>()

  function key(date: string, slotIndex: number) {
    return `${date}__${slotIndex}`
  }

  function isAvailable(date: string, slotIndex: number) {
    return availability.has(key(date, slotIndex))
  }

  function handleToggle(date: string, slotIndex: number) {
    if (!selectedStudentId) return
    const k = key(date, slotIndex)
    const willBeAvailable = !availability.has(k)

    setAvailabilityMap((prev) => {
      const next = { ...prev }
      const s = new Set(prev[selectedStudentId] ?? [])
      if (willBeAvailable) s.add(k)
      else s.delete(k)
      next[selectedStudentId] = s
      return next
    })

    startTransition(async () => {
      await toggleSlotAvailability(selectedStudentId, termPeriodId, date, slotIndex, willBeAvailable)
    })
  }

  function getEnabledSlots(dow: number) {
    const max = slotLimits?.[String(dow)] ?? INTENSIVE_SLOTS.length
    return INTENSIVE_SLOTS.filter((s) => s.index <= max)
  }

  function handleToggleDay(date: string, allOn: boolean) {
    if (!selectedStudentId) return
    const dow = new Date(date).getDay()
    const enabledSlots = getEnabledSlots(dow)
    const newSlots = allOn ? enabledSlots.map((s) => s.index) : []

    setAvailabilityMap((prev) => {
      const next = { ...prev }
      const s = new Set(prev[selectedStudentId] ?? [])
      INTENSIVE_SLOTS.forEach((slot) => {
        if (allOn) s.add(key(date, slot.index))
        else s.delete(key(date, slot.index))
      })
      next[selectedStudentId] = s
      return next
    })

    startTransition(async () => {
      await setDayAvailability(selectedStudentId, termPeriodId, date, newSlots)
    })
  }

  function handleNotesChange(value: string) {
    if (!selectedStudentId) return
    setNotesMap((prev) => ({ ...prev, [selectedStudentId]: value }))
    setNotesSaving(true)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      await saveStudentNotes(selectedStudentId, termPeriodId, value)
      setNotesSaving(false)
    }, 800)
  }

  const filteredStudents = students.filter(
    (s) => !studentSearch || s.name.includes(studentSearch) || s.grade.includes(studentSearch)
  )

  function countAvailable(studentId: string) {
    return (availabilityMap[studentId] ?? new Set()).size
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      {/* 生徒一覧 */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700 mb-2">生徒を選択</p>
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="名前・学年で検索"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy"
            />
          </div>
          <ul className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {filteredStudents.map((student) => {
              const count = countAvailable(student.id)
              const isSelected = student.id === selectedStudentId
              return (
                <li key={student.id}>
                  <button
                    onClick={() => setSelectedStudentId(student.id)}
                    className={[
                      'w-full flex items-center justify-between px-4 py-3 text-left transition-colors',
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{student.name}</p>
                      <p className="text-xs text-gray-400">{getDisplayGrade(student.grade)}</p>
                    </div>
                    <span className={[
                      'text-xs font-bold px-2 py-0.5 rounded-full ml-2 flex-shrink-0',
                      count > 0 ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400',
                    ].join(' ')}>
                      {count}コマ
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* 希望入力グリッド */}
      <div className="lg:col-span-3">
        {!selectedStudent ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
            左から生徒を選択してください
          </div>
        ) : (
          <div className="space-y-4">
            {/* 生徒ヘッダー */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-gray-900 text-lg">{selectedStudent.name}</p>
                  <p className="text-sm text-gray-500">{getDisplayGrade(selectedStudent.grade)}　{termPeriodName}</p>
                  <p className="text-xs text-teal-600 mt-1 font-medium">
                    {availability.size}コマ 選択済み
                    {isPending && <span className="ml-2 text-gray-400">保存中...</span>}
                  </p>
                </div>
                {/* 備考欄 */}
                <div className="flex-1 max-w-sm">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    備考・希望条件
                    {notesSaving && <span className="ml-1 text-gray-400">保存中...</span>}
                  </label>
                  <textarea
                    value={notesMap[selectedStudent.id] ?? ''}
                    onChange={(e) => handleNotesChange(e.target.value)}
                    placeholder="例：3コマ連続は避けてほしい、午前中は不可など"
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-navy resize-none"
                  />
                </div>
              </div>
            </div>

            {/* カレンダーグリッド */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-gray-200 bg-navy text-white px-3 py-2 text-left font-medium whitespace-nowrap w-28">
                        日付
                      </th>
                      <th className="border border-gray-200 bg-navy text-white px-2 py-2 text-center font-medium whitespace-nowrap w-16">
                        全選択
                      </th>
                      {INTENSIVE_SLOTS.map((slot) => (
                        <th key={slot.index} className="border border-gray-200 bg-navy text-white px-2 py-2 text-center font-medium whitespace-nowrap">
                          <div>第{slot.index}コマ</div>
                          <div className="text-[10px] opacity-70">{slot.start}〜</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dates.map((date) => {
                      const d = new Date(date)
                      const dow = d.getDay()
                      const dayLabel = DAY_NAMES[dow]
                      const isSun = dow === 0
                      const isSat = dow === 6
                      const enabledSlots = getEnabledSlots(dow)
                      const allChecked = enabledSlots.every((s) => isAvailable(date, s.index))
                      const someChecked = enabledSlots.some((s) => isAvailable(date, s.index))

                      return (
                        <tr key={date} className={isSun ? 'bg-red-50' : isSat ? 'bg-blue-50' : 'bg-white'}>
                          <td className="border border-gray-200 px-3 py-2 font-medium whitespace-nowrap">
                            <span className={isSun ? 'text-red-600' : isSat ? 'text-blue-600' : 'text-gray-700'}>
                              {date.slice(5).replace('-', '/')} ({dayLabel})
                            </span>
                          </td>
                          <td className="border border-gray-200 px-2 py-2 text-center">
                            <button
                              onClick={() => handleToggleDay(date, !allChecked)}
                              disabled={isPending}
                              className={[
                                'text-[10px] px-2 py-1 rounded font-medium transition-colors',
                                allChecked
                                  ? 'bg-teal-500 text-white hover:bg-teal-600'
                                  : someChecked
                                    ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                              ].join(' ')}
                            >
                              {allChecked ? '全解除' : '全選'}
                            </button>
                          </td>
                          {INTENSIVE_SLOTS.map((slot) => {
                            const checked = isAvailable(date, slot.index)
                            const disabled = slot.index > (slotLimits?.[String(dow)] ?? INTENSIVE_SLOTS.length)
                            if (disabled) {
                              return (
                                <td key={slot.index} className="border border-gray-100 px-2 py-2 text-center bg-gray-50">
                                  <div className="w-8 h-8 mx-auto rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-xs">—</div>
                                </td>
                              )
                            }
                            return (
                              <td key={slot.index} className="border border-gray-200 px-2 py-2 text-center">
                                <button
                                  onClick={() => handleToggle(date, slot.index)}
                                  disabled={isPending}
                                  className={[
                                    'w-8 h-8 rounded-lg border-2 transition-all',
                                    checked
                                      ? 'bg-teal-500 border-teal-500 text-white'
                                      : 'bg-white border-gray-200 hover:border-teal-300',
                                  ].join(' ')}
                                >
                                  {checked ? '✓' : ''}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 px-4 py-2 border-t border-gray-100">
                チェックを入れたコマが「来塾可能」として自動割り振りに使用されます
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
