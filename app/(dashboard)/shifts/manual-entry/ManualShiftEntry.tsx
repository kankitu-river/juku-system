'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveManualShifts } from './actions'

interface Teacher {
  id: string
  name: string
}

interface IntensivePeriod {
  id: string
  name: string
  start_date: string
  end_date: string
}

interface ManualShiftEntryProps {
  teachers: Teacher[]
  intensivePeriods?: IntensivePeriod[]
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

// 講習期間のデフォルト勤務時間（第1コマ開始〜最終コマ終了）
const INTENSIVE_DEFAULT = { start: '09:30', end: '21:20' }

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDaysInMonth(yearMonth: string): Date[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const days: Date[] = []
  const d = new Date(y, m - 1, 1)
  while (d.getMonth() === m - 1) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

export function ManualShiftEntry({ teachers, intensivePeriods = [] }: ManualShiftEntryProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [savedMsg, setSavedMsg] = useState<string>()

  const today = new Date()
  const [teacherId, setTeacherId] = useState('')
  const [ym, setYm] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  )
  const [defaultStart, setDefaultStart] = useState('16:00')
  const [defaultEnd, setDefaultEnd] = useState('21:30')

  // dateStr → {start, end} (selected dates)
  const [selectedDates, setSelectedDates] = useState<Record<string, { start: string; end: string }>>({})
  const [editingDate, setEditingDate] = useState<string | null>(null)

  const days = getDaysInMonth(ym)
  const firstDow = days[0].getDay()
  const [y, m] = ym.split('-').map(Number)

  // その日が講習期間に含まれるか
  function isIntensiveDate(dateStr: string): boolean {
    return intensivePeriods.some((p) => p.start_date <= dateStr && dateStr <= p.end_date)
  }

  function toggleDate(dateStr: string, dow: number) {
    if (dow === 0) return // 日曜は選択不可
    if (selectedDates[dateStr]) {
      setSelectedDates((prev) => { const n = { ...prev }; delete n[dateStr]; return n })
      if (editingDate === dateStr) setEditingDate(null)
    } else {
      // 講習期間の日は講習の時間帯（9:30〜21:20）をデフォルトにする
      const times = isIntensiveDate(dateStr)
        ? { ...INTENSIVE_DEFAULT }
        : { start: defaultStart, end: defaultEnd }
      setSelectedDates((prev) => ({ ...prev, [dateStr]: times }))
      setEditingDate(dateStr)
    }
  }

  function applyDefaultToAll() {
    setSelectedDates((prev) =>
      Object.fromEntries(Object.keys(prev).map((d) => [d, { start: defaultStart, end: defaultEnd }]))
    )
  }

  function updateTime(dateStr: string, field: 'start' | 'end', value: string) {
    setSelectedDates((prev) => ({
      ...prev,
      [dateStr]: { ...prev[dateStr], [field]: value },
    }))
  }

  function handleSubmit() {
    if (!teacherId) { setError('先生を選択してください'); return }
    const shifts = Object.entries(selectedDates)
      .filter(([, v]) => v.start < v.end)
      .map(([date, v]) => ({ date, start_time: v.start, end_time: v.end }))
    if (shifts.length === 0) { setError('出勤日を1日以上選択してください'); return }

    setError(undefined)
    setSavedMsg(undefined)
    startTransition(async () => {
      const result = await saveManualShifts(teacherId, shifts)
      if (result.error) { setError(result.error); return }
      setSavedMsg(`${result.saved}日分のシフトを登録しました`)
      setSelectedDates({})
      setEditingDate(null)
      router.refresh()
    })
  }

  const teacherName = teachers.find((t) => t.id === teacherId)?.name ?? ''
  const selectedCount = Object.keys(selectedDates).length

  const editingSlot = editingDate ? selectedDates[editingDate] : null

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}
      {savedMsg && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 px-4 py-3 text-sm text-green-700 dark:text-green-300">{savedMsg}</div>
      )}

      {/* 先生・月の選択 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">シフト情報の入力</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">先生</label>
            <select
              value={teacherId}
              onChange={(e) => { setTeacherId(e.target.value); setSelectedDates({}); setEditingDate(null) }}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            >
              <option value="">選択してください</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">対象月</label>
            <input
              type="month"
              value={ym}
              onChange={(e) => { setYm(e.target.value); setSelectedDates({}); setEditingDate(null) }}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            />
          </div>
        </div>

        {/* デフォルト時間 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">デフォルト時間</label>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={defaultStart}
              onChange={(e) => setDefaultStart(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            />
            <span className="text-gray-400 text-sm">〜</span>
            <input
              type="time"
              value={defaultEnd}
              onChange={(e) => setDefaultEnd(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            />
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={applyDefaultToAll}
                className="text-xs text-navy dark:text-blue-300 hover:underline whitespace-nowrap"
              >
                全日に適用
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">日付を選ぶとこの時間が自動入力されます</p>
        </div>
      </div>

      {/* カレンダー */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-gray-800 dark:text-gray-100">{y}年{m}月</p>
          {teacherId && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {teacherName} · <span className="font-bold text-navy dark:text-blue-300">{selectedCount}</span>日選択中
            </span>
          )}
        </div>

        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES.map((d, i) => (
            <div key={d} className={[
              'text-center text-xs font-medium py-1',
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400',
            ].join(' ')}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}
          {days.map((d) => {
            const ds = toDateStr(d)
            const dow = d.getDay()
            const isSunday = dow === 0
            const isSelected = !!selectedDates[ds]
            const isEditing = editingDate === ds
            const isToday = ds === toDateStr(new Date())
            const isIntensive = isIntensiveDate(ds)
            const disabled = !teacherId || isSunday

            return (
              <button
                key={ds}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && toggleDate(ds, dow)}
                className={[
                  'rounded-xl text-xs font-medium transition-all flex flex-col items-center justify-center py-2 gap-0.5 min-h-[44px]',
                  isSunday
                    ? 'text-red-200 cursor-not-allowed'
                    : disabled
                      ? 'text-gray-200 cursor-not-allowed'
                      : isEditing
                        ? 'bg-amber-400 text-white shadow-sm ring-2 ring-amber-500 ring-offset-1'
                        : isSelected
                          ? 'bg-navy text-white shadow-sm'
                          : isIntensive
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100'
                            : dow === 6
                              ? 'text-blue-500 hover:bg-blue-50'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
                  isToday && !isSelected && !isEditing && !disabled ? 'ring-2 ring-navy ring-offset-1' : '',
                ].join(' ')}
              >
                <span>{d.getDate()}</span>
                {isSelected ? (
                  <span className="text-[8px] leading-none font-bold text-white opacity-90">
                    {selectedDates[ds].start.slice(0, 5)}
                  </span>
                ) : isIntensive && !disabled ? (
                  <span className="w-1 h-1 rounded-full bg-amber-400" />
                ) : null}
              </button>
            )
          })}
        </div>

        {intensivePeriods.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-3">
            <span className="inline-block w-3 h-3 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-300" />
            講習期間の日（選択すると 9:30〜21:20 が自動入力されます）
          </p>
        )}

        {!teacherId && (
          <p className="text-center text-xs text-gray-400 mt-3">先生を選択すると日付を選べます</p>
        )}
      </div>

      {/* 選択日の時間調整 */}
      {editingDate && editingSlot && (
        <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
              {new Date(editingDate + 'T12:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}の時間
            </p>
            <button onClick={() => setEditingDate(null)} className="text-xs text-gray-400 hover:text-gray-600">閉じる</button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={editingSlot.start}
              onChange={(e) => updateTime(editingDate, 'start', e.target.value)}
              className="border border-blue-300 dark:border-blue-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-gray-800"
            />
            <span className="text-gray-400">〜</span>
            <input
              type="time"
              value={editingSlot.end}
              onChange={(e) => updateTime(editingDate, 'end', e.target.value)}
              className="border border-blue-300 dark:border-blue-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-gray-800"
            />
          </div>
        </div>
      )}

      {/* 選択リスト */}
      {selectedCount > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">選択した出勤日（{selectedCount}日）</p>
            <button
              type="button"
              onClick={() => { setSelectedDates({}); setEditingDate(null) }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              全解除
            </button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {Object.entries(selectedDates)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([ds, times]) => {
                const d = new Date(ds + 'T12:00:00')
                const dow = d.getDay()
                const isEditing = editingDate === ds
                return (
                  <div
                    key={ds}
                    className={[
                      'flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors',
                      isEditing ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900' : 'bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-700',
                    ].join(' ')}
                    onClick={() => setEditingDate(isEditing ? null : ds)}
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {d.getMonth() + 1}/{d.getDate()}（{DAY_NAMES[dow]}）
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        {times.start}〜{times.end}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedDates((prev) => { const n = { ...prev }; delete n[ds]; return n })
                          if (editingDate === ds) setEditingDate(null)
                        }}
                        className="text-gray-300 hover:text-red-400 text-xs"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* 登録ボタン */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || selectedCount === 0 || !teacherId}
        className="w-full bg-navy text-white font-semibold py-4 rounded-xl hover:bg-navy-light transition-colors disabled:opacity-40 text-base"
      >
        {isPending ? '登録中...' : `${teacherName ? `${teacherName}先生の` : ''}${selectedCount}日分のシフトを登録する`}
      </button>
    </div>
  )
}
