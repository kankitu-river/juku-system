'use client'

import { useState, useTransition } from 'react'
import { submitSurveyResponse } from './actions'
import { REGULAR_SLOTS, INTENSIVE_SLOTS, SATURDAY_INDIVIDUAL_SLOTS } from '@/lib/constants/timeSlots'
import type { TimeSlot } from '@/types'

interface Token {
  id: string
  teacher_id: string
  responded_at: string | null
  teacher: { id: string; name: string } | null
}

interface SurveyRespondProps {
  surveyId: string
  targetMonth: string
  deadline: string
  termType: 'regular' | 'intensive'
  tokens: Token[]
  slotsMap: Record<string, Record<string, number[]>>
  closureDates?: string[]
  preselectedTeacherId?: string | null
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDaysInMonth(yearMonth: string): Date[] {
  const [year, month] = yearMonth.split('-').map(Number)
  const days: Date[] = []
  const d = new Date(year, month - 1, 1)
  while (d.getMonth() === month - 1) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function getSlotsForDate(dateStr: string, termType: 'regular' | 'intensive'): TimeSlot[] {
  if (termType === 'intensive') return INTENSIVE_SLOTS
  const dow = new Date(dateStr + 'T12:00:00').getDay()
  if (dow === 0) return []
  if (dow === 6) return SATURDAY_INDIVIDUAL_SLOTS
  return REGULAR_SLOTS
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日（${DAY_NAMES[d.getDay()]}）`
}

export function SurveyRespond({
  surveyId, targetMonth, termType, tokens, slotsMap, closureDates = [], preselectedTeacherId,
}: SurveyRespondProps) {
  const preselected = preselectedTeacherId
    ? tokens.find((t) => t.teacher_id === preselectedTeacherId) ?? null
    : null

  const [step, setStep] = useState<'select' | 'calendar' | 'done'>(preselected ? 'calendar' : 'select')
  const [selectedTeacher, setSelectedTeacher] = useState<Token | null>(preselected)
  const [selectedSlots, setSelectedSlots] = useState<Record<string, number[]>>(
    preselected ? (slotsMap[preselected.teacher_id] ?? {}) : {}
  )
  const [activeDate, setActiveDate] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  const days = getDaysInMonth(targetMonth)
  const [year, month] = targetMonth.split('-').map(Number)
  const firstDow = days[0].getDay()

  function handleSelectTeacher(token: Token) {
    setSelectedTeacher(token)
    setSelectedSlots(slotsMap[token.teacher_id] ?? {})
    setActiveDate(null)
    setStep('calendar')
  }

  function handleDateClick(dateStr: string) {
    const slots = getSlotsForDate(dateStr, termType)
    if (slots.length === 0) return

    if (selectedSlots[dateStr] !== undefined) {
      if (activeDate === dateStr) {
        setActiveDate(null)
      } else {
        setActiveDate(dateStr)
      }
    } else {
      setSelectedSlots((prev) => ({ ...prev, [dateStr]: slots.map((s) => s.index) }))
      setActiveDate(dateStr)
    }
  }

  function removeDate(dateStr: string) {
    setSelectedSlots((prev) => {
      const next = { ...prev }
      delete next[dateStr]
      return next
    })
    if (activeDate === dateStr) setActiveDate(null)
  }

  function toggleSlot(dateStr: string, slotIndex: number) {
    setSelectedSlots((prev) => {
      const current = prev[dateStr] ?? []
      const next = current.includes(slotIndex)
        ? current.filter((i) => i !== slotIndex)
        : [...current, slotIndex].sort((a, b) => a - b)
      return { ...prev, [dateStr]: next }
    })
  }

  function selectAllSlots(dateStr: string) {
    const slots = getSlotsForDate(dateStr, termType)
    setSelectedSlots((prev) => ({ ...prev, [dateStr]: slots.map((s) => s.index) }))
  }

  function clearAllSlots(dateStr: string) {
    setSelectedSlots((prev) => ({ ...prev, [dateStr]: [] }))
  }

  function handleSubmit() {
    if (!selectedTeacher) return
    setError(undefined)
    startTransition(async () => {
      const result = await submitSurveyResponse(surveyId, selectedTeacher.teacher_id, selectedSlots)
      if (result.error) { setError(result.error); return }
      setStep('done')
    })
  }

  const selectedDateCount = Object.keys(selectedSlots).length
  const totalSlotCount = Object.values(selectedSlots).reduce((sum, s) => sum + s.length, 0)

  // 完了画面
  if (step === 'done') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
        <div className="text-4xl mb-3">✅</div>
        <p className="text-lg font-semibold text-green-800">回答を受け付けました</p>
        <p className="text-sm text-green-600 mt-2">
          {selectedTeacher?.teacher?.name} 先生：{selectedDateCount}日間、合計 {totalSlotCount} コマ登録
        </p>
        <p className="text-xs text-gray-400 mt-4">このページは閉じても大丈夫です</p>
        <button onClick={() => setStep('select')} className="mt-4 text-sm text-[#1E3A5F] underline">
          別の先生の回答を入力する
        </button>
      </div>
    )
  }

  // カレンダー画面
  if (step === 'calendar' && selectedTeacher) {
    const activeDateSlots = activeDate ? getSlotsForDate(activeDate, termType) : []
    const activeDateSelected = activeDate ? (selectedSlots[activeDate] ?? []) : []

    return (
      <div className="space-y-4">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setStep('select')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            ← 戻る
          </button>
          <div className="bg-[#1E3A5F] text-white px-3 py-1.5 rounded-lg text-sm font-semibold">
            {selectedTeacher.teacher?.name} 先生
          </div>
          {slotsMap[selectedTeacher.teacher_id] && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
              回答を更新中
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* カレンダー */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-0.5">{year}年{month}月</p>
          <p className="text-xs text-gray-400 mb-3">出勤できる日をタップ → コマを選択してください</p>

          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d, i) => (
              <div key={d} className={['text-center text-xs font-medium py-1',
                i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500'].join(' ')}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}
            {days.map((d) => {
              const dateStr = toDateStr(d)
              const dow = d.getDay()
              const isClosed = closureDates.includes(dateStr)
              const hasSlots = getSlotsForDate(dateStr, termType).length > 0
              const isSelected = selectedSlots[dateStr] !== undefined
              const isActive = activeDate === dateStr
              const slotCount = selectedSlots[dateStr]?.length ?? 0
              const isToday = dateStr === toDateStr(new Date())

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isClosed || !hasSlots}
                  onClick={() => !isClosed && hasSlots && handleDateClick(dateStr)}
                  className={[
                    'rounded-xl text-xs font-medium transition-all flex flex-col items-center justify-center py-1.5 gap-0.5 min-h-[44px]',
                    isClosed
                      ? 'bg-red-100 text-red-400 cursor-not-allowed'
                      : !hasSlots
                        ? 'text-gray-200 cursor-not-allowed'
                        : isActive
                          ? 'bg-amber-400 text-white shadow-sm ring-2 ring-amber-500 ring-offset-1'
                          : isSelected
                            ? 'bg-[#1E3A5F] text-white shadow-sm'
                            : dow === 0 ? 'text-red-400 hover:bg-red-50'
                            : dow === 6 ? 'text-blue-400 hover:bg-blue-50'
                            : 'text-gray-700 hover:bg-gray-100',
                    isToday && !isSelected && !isActive && !isClosed && hasSlots ? 'ring-2 ring-[#1E3A5F] ring-offset-1' : '',
                  ].join(' ')}
                >
                  <span>{d.getDate()}</span>
                  {isSelected && (
                    <span className="text-[9px] leading-none font-bold text-white opacity-90">
                      {slotCount}コマ
                    </span>
                  )}
                  {isClosed && <span className="text-[8px] font-bold leading-none">休</span>}
                </button>
              )
            })}
          </div>

          {closureDates.length > 0 && (
            <p className="mt-2 text-xs text-red-400 text-center">赤い日は休校日のため選択できません</p>
          )}
        </div>

        {/* コマ選択パネル */}
        {activeDate && (
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-blue-800">{formatDate(activeDate)}</p>
              <div className="flex items-center gap-2 text-xs">
                <button onClick={() => selectAllSlots(activeDate)} className="text-blue-600 hover:text-blue-800 font-medium">全選択</button>
                <span className="text-blue-300">|</span>
                <button onClick={() => clearAllSlots(activeDate)} className="text-blue-600 hover:text-blue-800 font-medium">全解除</button>
                <span className="text-blue-300">|</span>
                <button onClick={() => removeDate(activeDate)} className="text-red-500 hover:text-red-700 font-medium">この日を削除</button>
              </div>
            </div>
            <div className="space-y-2">
              {activeDateSlots.map((slot) => {
                const isSlotSelected = activeDateSelected.includes(slot.index)
                return (
                  <button
                    key={slot.index}
                    type="button"
                    onClick={() => toggleSlot(activeDate, slot.index)}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all text-left',
                      isSlotSelected
                        ? 'bg-[#1E3A5F] text-white'
                        : 'bg-white border border-blue-200 text-blue-800 hover:bg-blue-100',
                    ].join(' ')}
                  >
                    <span className={[
                      'text-[11px] font-bold px-1.5 py-0.5 rounded flex-shrink-0',
                      isSlotSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600',
                    ].join(' ')}>
                      第{slot.index}コマ
                    </span>
                    <span>{slot.start}〜{slot.end}</span>
                    {isSlotSelected && <span className="ml-auto text-base">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* サマリー */}
        <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-blue-700">
            <span className="font-bold text-lg text-[#1E3A5F]">{selectedDateCount}</span> 日間・
            合計 <span className="font-bold text-lg text-[#1E3A5F]">{totalSlotCount}</span> コマ選択中
          </p>
          {selectedDateCount > 0 && (
            <button type="button" onClick={() => { setSelectedSlots({}); setActiveDate(null) }}
              className="text-xs text-blue-500 hover:text-blue-700">
              全解除
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full bg-[#1E3A5F] text-white font-semibold py-4 rounded-xl hover:bg-[#2d5487] transition-colors disabled:opacity-50 text-base"
        >
          {isPending ? '送信中...' : '回答を送信する'}
        </button>
      </div>
    )
  }

  // 先生選択画面
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <p className="text-sm font-semibold text-gray-700 mb-4">あなたの名前を選んでください</p>
        <div className="space-y-2">
          {tokens.map((token) => {
            const hasResponded = !!token.responded_at
            return (
              <button
                key={token.id}
                type="button"
                onClick={() => handleSelectTeacher(token)}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-gray-200 hover:border-[#1E3A5F] hover:bg-blue-50 transition-colors text-left group"
              >
                <span className="font-medium text-gray-800 group-hover:text-[#1E3A5F]">
                  {token.teacher?.name ?? '—'} 先生
                </span>
                {hasResponded ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium flex-shrink-0">
                    ✓ 回答済み（修正可）
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 flex-shrink-0">未回答 →</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <p className="text-xs text-center text-gray-400">回答済みの先生も選択すると内容を更新できます</p>
    </div>
  )
}
