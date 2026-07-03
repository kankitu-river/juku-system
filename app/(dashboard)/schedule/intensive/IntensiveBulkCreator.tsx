'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SUBJECTS, INTENSIVE_SLOTS, getIntensiveSlotsForDay, type IntensiveSlotLimits } from '@/lib/constants/timeSlots'
import { bulkCreateIntensiveLessons } from './actions'

interface Teacher {
  id: string
  name: string
}

interface Booth {
  id: string
  name: string
}

interface Props {
  termPeriodName: string
  startDate: string
  endDate: string
  teachers: Teacher[]
  booths: Booth[]
  intensiveSlotLimits: IntensiveSlotLimits | null
  closureDates: string[]
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

// 期間内の日付一覧（日曜を除く）
function buildPeriodDays(startDate: string, endDate: string): { date: string; dow: number; label: string }[] {
  const days: { date: string; dow: number; label: string }[] = []
  const d = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  while (d <= end) {
    const dow = d.getDay()
    if (dow !== 0) {
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      days.push({ date, dow, label: `${d.getMonth() + 1}/${d.getDate()}` })
    }
    d.setDate(d.getDate() + 1)
  }
  return days
}

export function IntensiveBulkCreator({
  termPeriodName, startDate, endDate, teachers, booths, intensiveSlotLimits, closureDates,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [subject, setSubject] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [boothId, setBoothId] = useState('')
  const [type, setType] = useState<'individual' | 'group'>('individual')
  const [capacity, setCapacity] = useState(2)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [selectedSlots, setSelectedSlots] = useState<Set<number>>(new Set())

  const days = useMemo(() => buildPeriodDays(startDate, endDate), [startDate, endDate])

  // 日付×スロットの組み合わせ（曜日ごとの最終コマ制限を適用）
  const entries = useMemo(() => {
    const result: { date: string; slot_index: number }[] = []
    for (const date of selectedDates) {
      const dow = new Date(`${date}T12:00:00`).getDay()
      const allowed = new Set(getIntensiveSlotsForDay(dow, intensiveSlotLimits).map((s) => s.index))
      for (const slot of selectedSlots) {
        if (allowed.has(slot)) result.push({ date, slot_index: slot })
      }
    }
    return result
  }, [selectedDates, selectedSlots, intensiveSlotLimits])

  function toggleDate(date: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function toggleSlot(index: number) {
    setSelectedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function selectAllDates() {
    setSelectedDates(new Set(days.filter((d) => !closureDates.includes(d.date)).map((d) => d.date)))
  }

  function handleCreate() {
    if (!subject) { setError('科目を選択してください'); return }
    if (entries.length === 0) { setError('日付とコマを1つ以上選択してください'); return }
    setError('')
    setSuccess('')
    startTransition(async () => {
      const res = await bulkCreateIntensiveLessons({
        subject,
        teacher_id: teacherId || null,
        booth_id: boothId || null,
        type,
        capacity,
        entries,
      })
      if (res.error) { setError(res.error); return }
      setSuccess(`${res.count}コマを作成しました`)
      setSelectedDates(new Set())
      setSelectedSlots(new Set())
      router.refresh()
    })
  }

  return (
    <div className="mb-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between text-left"
      >
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">講習コマの一括作成</p>
          <p className="text-xs text-gray-400 mt-0.5">{termPeriodName}の日程にまとめてコマを作成できます</p>
        </div>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
          {error && (
            <div className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</div>
          )}
          {success && (
            <div className="text-xs text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 rounded-lg px-3 py-2">{success}</div>
          )}

          {/* 基本設定 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">科目 <span className="text-red-500">*</span></label>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm">
                <option value="">選択</option>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">担当講師</label>
              <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm">
                <option value="">未割り当て</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">形式</label>
              <select value={type} onChange={(e) => setType(e.target.value as 'individual' | 'group')}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm">
                <option value="individual">個別指導</option>
                <option value="group">集団授業</option>
              </select>
            </div>
            {type === 'individual' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">ブース</label>
                <select value={boothId} onChange={(e) => setBoothId(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm">
                  <option value="">未割り当て</option>
                  {booths.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">定員</label>
              <input type="number" min={1} max={100} value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm" />
            </div>
          </div>

          {/* スロット選択 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">時間帯（複数選択可）</label>
            <div className="flex flex-wrap gap-1.5">
              {INTENSIVE_SLOTS.map((slot) => (
                <button
                  key={slot.index}
                  type="button"
                  onClick={() => toggleSlot(slot.index)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    selectedSlots.has(slot.index)
                      ? 'bg-navy text-white border-navy'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-navy',
                  ].join(' ')}
                >
                  第{slot.index}コマ <span className="opacity-70">{slot.start}〜</span>
                </button>
              ))}
            </div>
          </div>

          {/* 日付選択 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">日付（複数選択可）</label>
              <div className="flex gap-2">
                <button type="button" onClick={selectAllDates} className="text-xs text-navy dark:text-blue-300 hover:underline">全選択</button>
                <button type="button" onClick={() => setSelectedDates(new Set())} className="text-xs text-gray-400 hover:underline">解除</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {days.map((d) => {
                const isClosed = closureDates.includes(d.date)
                const isSelected = selectedDates.has(d.date)
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={isClosed}
                    onClick={() => toggleDate(d.date)}
                    className={[
                      'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      isClosed
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-300 border-red-100 dark:border-red-900 cursor-not-allowed'
                        : isSelected
                          ? 'bg-navy text-white border-navy'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-navy',
                    ].join(' ')}
                  >
                    {d.label}<span className="opacity-60 ml-0.5">({DAY_NAMES[d.dow]})</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 作成ボタン */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-400">
              {entries.length > 0
                ? <>作成されるコマ数: <span className="font-bold text-navy dark:text-blue-300">{entries.length}</span>（{selectedDates.size}日 × 選択スロット）</>
                : '日付と時間帯を選択してください'}
            </p>
            <button
              onClick={handleCreate}
              disabled={isPending || entries.length === 0 || !subject}
              className="px-5 py-2.5 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-dark disabled:opacity-40 transition-colors"
            >
              {isPending ? '作成中...' : `${entries.length}コマを一括作成`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
