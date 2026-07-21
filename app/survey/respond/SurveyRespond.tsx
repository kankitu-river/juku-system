'use client'

import { useState, useTransition } from 'react'
import { submitSurveyResponse } from './actions'
import { REGULAR_SLOTS, INTENSIVE_SLOTS, SATURDAY_INDIVIDUAL_SLOTS } from '@/lib/constants/timeSlots'
import { SURVEY_NG_REASONS, SURVEY_MAYBE_REASONS } from '@/lib/constants/surveyReasons'
import { toDateStr } from '@/lib/utils/datetime'
import type { TimeSlot } from '@/types'

export interface Token {
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
  maybeSlotsMap?: Record<string, Record<string, number[]>>
  closureDates?: string[]
  intensivePeriodDates?: string[] | null
  preselectedTeacherId?: string | null
  previousDayPattern?: Record<number, number[]> | null
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

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

function groupByMonth(dates: string[]): { ym: string; dates: string[] }[] {
  const map = new Map<string, string[]>()
  for (const d of dates) {
    const ym = d.slice(0, 7)
    const list = map.get(ym) ?? []
    list.push(d)
    map.set(ym, list)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, dates]) => ({ ym, dates }))
}

function toDayPattern(slotsMap: Record<string, number[]>): Record<number, number[]> {
  const pattern: Record<number, Set<number>> = {}
  for (const [dateStr, slots] of Object.entries(slotsMap)) {
    if (!slots || slots.length === 0) continue
    const dow = new Date(dateStr + 'T12:00:00').getDay()
    if (!pattern[dow]) pattern[dow] = new Set()
    slots.forEach((s) => pattern[dow].add(s))
  }
  return Object.fromEntries(
    Object.entries(pattern).map(([dow, set]) => [Number(dow), [...set].sort((a, b) => a - b)])
  )
}

function computeChanges(
  current: Record<number, number[]>,
  previous: Record<number, number[]>
): string[] {
  const allDows = [...new Set([...Object.keys(current), ...Object.keys(previous)].map(Number))].sort()
  const changes: string[] = []
  for (const dow of allDows) {
    const prev = (previous[dow] ?? []).join(',')
    const cur = (current[dow] ?? []).join(',')
    if (prev !== cur) {
      const prevLabel = prev ? `第${(previous[dow] ?? []).map((i) => i).join('・')}コマ` : 'なし'
      const curLabel = cur ? `第${(current[dow] ?? []).map((i) => i).join('・')}コマ` : 'なし'
      changes.push(`${DAY_NAMES[dow]}曜日：${prevLabel} → ${curLabel}`)
    }
  }
  return changes
}

export function SurveyRespond({
  surveyId, targetMonth, termType, tokens, slotsMap, maybeSlotsMap = {},
  closureDates = [], intensivePeriodDates, preselectedTeacherId, previousDayPattern,
}: SurveyRespondProps) {
  const preselected = preselectedTeacherId
    ? tokens.find((t) => t.teacher_id === preselectedTeacherId) ?? null
    : null

  const [step, setStep] = useState<'select' | 'calendar' | 'done'>(preselected ? 'calendar' : 'select')
  const [selectedTeacher, setSelectedTeacher] = useState<Token | null>(preselected)

  // 三段階状態
  const [okSlots, setOkSlots] = useState<Record<string, number[]>>(
    preselected ? (slotsMap[preselected.teacher_id] ?? {}) : {}
  )
  const [maybeSlots, setMaybeSlots] = useState<Record<string, number[]>>(
    preselected ? (maybeSlotsMap[preselected.teacher_id] ?? {}) : {}
  )
  const [ngReasonsByDate, setNgReasonsByDate] = useState<Record<string, string[]>>({})
  const [ngNoteByDate, setNgNoteByDate] = useState<Record<string, string>>({})
  const [maybeReasonsByDate, setMaybeReasonsByDate] = useState<Record<string, string[]>>({})
  const [maybeNoteByDate, setMaybeNoteByDate] = useState<Record<string, string>>({})
  const [openedDates, setOpenedDates] = useState<Set<string>>(
    preselected
      ? new Set([
          ...Object.keys(slotsMap[preselected.teacher_id] ?? {}),
          ...Object.keys(maybeSlotsMap[preselected.teacher_id] ?? {}),
        ])
      : new Set()
  )
  const [activeDate, setActiveDate] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [changeWarning, setChangeWarning] = useState<string[] | null>(null)
  const [freeText, setFreeText] = useState('')
  const [aiParsing, setAiParsing] = useState(false)
  const [aiResult, setAiResult] = useState<{ available_days: number[]; time_preference: string; notes: string } | null>(null)

  async function handleAIParse() {
    if (!freeText.trim()) return
    setAiParsing(true)
    setAiResult(null)
    try {
      const res = await fetch('/api/ai/parse-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: freeText }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setAiResult(data)
    } catch {
      setError('AI解析に失敗しました')
    } finally {
      setAiParsing(false)
    }
  }

  const days = getDaysInMonth(targetMonth)
  const [year, month] = targetMonth.split('-').map(Number)
  const firstDow = days[0].getDay()

  const intensiveMonthGroups = intensivePeriodDates ? groupByMonth(intensivePeriodDates) : []

  function getSlotState(dateStr: string, slotIndex: number): 'ok' | 'maybe' | 'ng' {
    if ((okSlots[dateStr] ?? []).includes(slotIndex)) return 'ok'
    if ((maybeSlots[dateStr] ?? []).includes(slotIndex)) return 'maybe'
    return 'ng'
  }

  function getDateState(dateStr: string): 'ok' | 'maybe' | 'ng' | 'unset' {
    if (!openedDates.has(dateStr)) return 'unset'
    if ((okSlots[dateStr] ?? []).length > 0) return 'ok'
    if ((maybeSlots[dateStr] ?? []).length > 0) return 'maybe'
    return 'ng'
  }

  function cycleSlot(dateStr: string, slotIndex: number) {
    const state = getSlotState(dateStr, slotIndex)
    setOkSlots(prev => {
      const slots = (prev[dateStr] ?? []).filter(i => i !== slotIndex)
      if (state === 'ng') return { ...prev, [dateStr]: [...slots, slotIndex].sort((a, b) => a - b) }
      return { ...prev, [dateStr]: slots }
    })
    setMaybeSlots(prev => {
      const slots = (prev[dateStr] ?? []).filter(i => i !== slotIndex)
      if (state === 'ok') return { ...prev, [dateStr]: [...slots, slotIndex].sort((a, b) => a - b) }
      return { ...prev, [dateStr]: slots }
    })
  }

  function removeDate(dateStr: string) {
    setOkSlots(prev => { const n = { ...prev }; delete n[dateStr]; return n })
    setMaybeSlots(prev => { const n = { ...prev }; delete n[dateStr]; return n })
    setNgReasonsByDate(prev => { const n = { ...prev }; delete n[dateStr]; return n })
    setNgNoteByDate(prev => { const n = { ...prev }; delete n[dateStr]; return n })
    setMaybeReasonsByDate(prev => { const n = { ...prev }; delete n[dateStr]; return n })
    setMaybeNoteByDate(prev => { const n = { ...prev }; delete n[dateStr]; return n })
    setOpenedDates(prev => { const n = new Set(prev); n.delete(dateStr); return n })
    if (activeDate === dateStr) setActiveDate(null)
  }

  function handleSelectTeacher(token: Token) {
    setSelectedTeacher(token)
    setOkSlots(slotsMap[token.teacher_id] ?? {})
    setMaybeSlots(maybeSlotsMap[token.teacher_id] ?? {})
    setNgReasonsByDate({})
    setNgNoteByDate({})
    setOpenedDates(new Set([
      ...Object.keys(slotsMap[token.teacher_id] ?? {}),
      ...Object.keys(maybeSlotsMap[token.teacher_id] ?? {}),
    ]))
    setActiveDate(null)
    setStep('calendar')
  }

  function handleDateClick(dateStr: string) {
    const slots = getSlotsForDate(dateStr, termType)
    if (slots.length === 0) return
    if (!openedDates.has(dateStr)) {
      setOkSlots(prev => ({ ...prev, [dateStr]: slots.map(s => s.index) }))
      setOpenedDates(prev => new Set([...prev, dateStr]))
    }
    setActiveDate(activeDate === dateStr ? null : dateStr)
  }

  function doSubmit() {
    if (!selectedTeacher) return
    setError(undefined)
    setChangeWarning(null)
    const allNgReasons = [...new Set(Object.values(ngReasonsByDate).flat())]
    const allNgNote = Object.entries(ngNoteByDate)
      .filter(([, v]) => v.trim())
      .map(([date, note]) => `${date}: ${note}`)
      .join(' / ')
    const allMaybeReasons = [...new Set(Object.values(maybeReasonsByDate).flat())]
    const allMaybeNote = Object.entries(maybeNoteByDate)
      .filter(([, v]) => v.trim())
      .map(([date, note]) => `${date}: ${note}`)
      .join(' / ')
    startTransition(async () => {
      const result = await submitSurveyResponse(
        surveyId,
        selectedTeacher.teacher_id,
        okSlots,
        maybeSlots,
        allNgReasons,
        allNgNote,
        allMaybeReasons,
        allMaybeNote,
      )
      if (result.error) { setError(result.error); return }
      setStep('done')
    })
  }

  function handleSubmit() {
    if (!selectedTeacher) return
    if (previousDayPattern && Object.keys(previousDayPattern).length > 0) {
      const currentPattern = toDayPattern(okSlots)
      const changes = computeChanges(currentPattern, previousDayPattern)
      if (changes.length > 0) {
        setChangeWarning(changes)
        return
      }
    }
    doSubmit()
  }

  const okCount = Object.values(okSlots).reduce((s, a) => s + a.length, 0)
  const maybeCount = Object.values(maybeSlots).reduce((s, a) => s + a.length, 0)

  if (step === 'done') {
    return (
      <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-xl p-8 text-center">
        <div className="text-4xl mb-3">✅</div>
        <p className="text-lg font-semibold text-green-800 dark:text-green-200">回答を受け付けました</p>
        <p className="text-sm text-green-600 dark:text-green-300 mt-2">
          {selectedTeacher?.teacher?.name} 先生：
          ○{okCount}コマ　△{maybeCount}コマ 登録
        </p>
        <p className="text-xs text-gray-400 mt-4">このページは閉じても大丈夫です</p>
        <button onClick={() => setStep('select')} className="mt-4 text-sm text-navy dark:text-blue-300 underline">
          別の先生の回答を入力する
        </button>
      </div>
    )
  }

  if (step === 'calendar' && selectedTeacher) {
    const activeDateSlots = activeDate ? getSlotsForDate(activeDate, termType) : []
    const hasNg = activeDate !== null
      && openedDates.has(activeDate)
      && activeDateSlots.some(s => getSlotState(activeDate, s.index) === 'ng')
    const hasMaybe = activeDate !== null
      && openedDates.has(activeDate)
      && (maybeSlots[activeDate] ?? []).length > 0

    const renderDateCell = (dateStr: string, d: Date, allowedDates?: string[]) => {
      const dow = d.getDay()
      const isClosed = closureDates.includes(dateStr)
      const isAllowed = allowedDates ? allowedDates.includes(dateStr) : true
      const hasSlots = getSlotsForDate(dateStr, termType).length > 0
      const isSelectable = !isClosed && hasSlots && isAllowed
      const dateState = getDateState(dateStr)
      const isActive = activeDate === dateStr
      const isToday = dateStr === toDateStr(new Date())

      return (
        <button
          key={dateStr}
          type="button"
          disabled={!isSelectable}
          onClick={() => isSelectable && handleDateClick(dateStr)}
          className={[
            'rounded-xl text-xs font-medium transition-all flex flex-col items-center justify-center py-1.5 gap-0.5 min-h-[44px]',
            isClosed
              ? 'bg-red-100 dark:bg-red-900/60 text-red-400 cursor-not-allowed'
              : !isSelectable
                ? 'text-gray-200 cursor-not-allowed'
                : isActive
                  ? 'ring-2 ring-navy ring-offset-1 bg-navy/10'
                  : dateState === 'ok'
                    ? 'bg-teal-500 text-white'
                    : dateState === 'maybe'
                      ? 'bg-amber-400 text-white'
                      : dateState === 'ng'
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                        : dow === 0
                          ? 'text-red-400 hover:bg-red-50'
                          : dow === 6
                            ? 'text-blue-400 hover:bg-blue-50'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
            isToday && dateState === 'unset' && isSelectable && !isActive ? 'ring-2 ring-navy ring-offset-1' : '',
          ].join(' ')}
        >
          <span>{d.getDate()}</span>
          {dateState === 'ok' && <span className="text-[9px] leading-none font-bold text-white opacity-90">○</span>}
          {dateState === 'maybe' && <span className="text-[9px] leading-none font-bold text-white opacity-90">△</span>}
          {dateState === 'ng' && <span className="text-[9px] leading-none font-bold text-gray-400 opacity-90">×</span>}
          {isClosed && <span className="text-[8px] font-bold leading-none">休</span>}
        </button>
      )
    }

    return (
      <div className="space-y-4">
        {/* AI 自由記述パース */}
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-1">
            <span className="text-[10px] bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded font-bold">AI生成</span>
            自由記述からカレンダーを自動入力
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="例: 火木の夕方以降なら来られます"
              className="flex-1 text-sm border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              type="button"
              onClick={handleAIParse}
              disabled={aiParsing || !freeText.trim()}
              className="px-3 py-1.5 text-sm bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {aiParsing ? '解析中…' : 'AI解析'}
            </button>
          </div>
          {aiResult && (
            <div className="mt-2 text-xs text-blue-700 dark:text-blue-300 bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-100 dark:border-blue-800">
              <p className="font-medium mb-1">解析結果（参考値 — カレンダーを確認・修正してください）:</p>
              <p>出勤可能曜日: {aiResult.available_days.length > 0 ? aiResult.available_days.map((d) => DAY_NAMES[d]).join('・') : 'なし'}</p>
              <p>時間帯: {aiResult.time_preference || 'なし'}</p>
              {aiResult.notes && <p>備考: {aiResult.notes}</p>}
            </div>
          )}
        </div>

        {/* 差分警告モーダル */}
        {changeWarning && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-100">前回の回答と異なります</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">以下の曜日・コマが変わっています</p>
                </div>
              </div>
              <ul className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-4 py-3 space-y-1">
                {changeWarning.map((c, i) => (
                  <li key={i} className="text-sm text-amber-800 dark:text-amber-200">{c}</li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 dark:text-gray-400">このまま送信しますか？</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={doSubmit}
                  disabled={isPending}
                  className="flex-1 bg-navy text-white font-semibold py-2.5 rounded-lg hover:bg-navy-light transition-colors disabled:opacity-50 text-sm"
                >
                  {isPending ? '送信中...' : 'このまま送信'}
                </button>
                <button
                  type="button"
                  onClick={() => setChangeWarning(null)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm"
                >
                  見直す
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ヘッダー */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setStep('select')} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← 戻る</button>
          <div className="bg-navy text-white px-3 py-1.5 rounded-lg text-sm font-semibold">
            {selectedTeacher.teacher?.name} 先生
          </div>
          {termType === 'intensive' && (
            <span className="text-xs bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 px-2 py-1 rounded-full font-medium">講習期間</span>
          )}
          {(slotsMap[selectedTeacher.teacher_id] || maybeSlotsMap[selectedTeacher.teacher_id]) && (
            <span className="text-xs text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-2 py-1 rounded-full">回答を更新中</span>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
        )}

        {/* カレンダー */}
        {termType === 'intensive' && intensiveMonthGroups.length > 0 ? (
          <div className="space-y-4">
            {intensiveMonthGroups.map(({ ym, dates: monthDates }) => {
              const [y, m] = ym.split('-').map(Number)
              const monthDays = getDaysInMonth(ym)
              const fd = monthDays[0].getDay()
              return (
                <div key={ym} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{y}年{m}月</p>
                  {/* 凡例 */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-sm bg-teal-500" />○出られる</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-sm bg-amber-400" />△調整すれば出られる</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-sm bg-gray-200 dark:bg-gray-700" />×出られない</span>
                  </div>
                  <div className="grid grid-cols-7 mb-1">
                    {DAY_NAMES.map((d, i) => (
                      <div key={d} className={['text-center text-xs font-medium py-1',
                        i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500 dark:text-gray-400'].join(' ')}>
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: fd }).map((_, i) => <div key={`e-${i}`} />)}
                    {monthDays.map((d) => renderDateCell(toDateStr(d), d, monthDates))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-0.5">{year}年{month}月</p>
            <p className="text-xs text-gray-400 mb-2">出勤できる日をタップ → コマをタップして○/△/×を切り替えてください</p>
            {/* 凡例 */}
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-sm bg-teal-500" />○出られる</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-sm bg-amber-400" />△調整すれば出られる</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-sm bg-gray-200 dark:bg-gray-700" />×出られない</span>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map((d, i) => (
                <div key={d} className={['text-center text-xs font-medium py-1',
                  i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500 dark:text-gray-400'].join(' ')}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}
              {days.map((d) => renderDateCell(toDateStr(d), d))}
            </div>
            {closureDates.length > 0 && (
              <p className="mt-2 text-xs text-red-400 text-center">赤い日は休校日のため選択できません</p>
            )}
          </div>
        )}

        {/* コマ選択パネル */}
        {activeDate && (
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{formatDate(activeDate)}</p>
              <button onClick={() => removeDate(activeDate)} className="text-xs text-red-500 hover:text-red-700 font-medium">この日を削除</button>
            </div>
            <p className="text-xs text-gray-400 mb-2">タップするたびに ○ → △ → × と切り替わります</p>
            <div className="space-y-2">
              {activeDateSlots.map((slot) => {
                const state = getSlotState(activeDate, slot.index)
                return (
                  <button
                    key={slot.index}
                    type="button"
                    onClick={() => cycleSlot(activeDate, slot.index)}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all text-left',
                      state === 'ok'
                        ? 'bg-teal-500 text-white'
                        : state === 'maybe'
                          ? 'bg-amber-400 text-white'
                          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400',
                    ].join(' ')}
                  >
                    <span className={[
                      'text-[11px] font-bold px-1.5 py-0.5 rounded flex-shrink-0',
                      state === 'ok' || state === 'maybe' ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700',
                    ].join(' ')}>
                      第{slot.index}コマ
                    </span>
                    <span>{slot.start}〜{slot.end}</span>
                    <span className="ml-auto text-base font-bold">
                      {state === 'ok' ? '○' : state === 'maybe' ? '△' : '×'}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 理由パネル: ×または△のコマがあれば即表示 */}
            {(hasNg || hasMaybe) && (
              <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3 space-y-3">
                {hasNg && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">×の理由（任意・複数選択可）</p>
                    <div className="flex flex-wrap gap-2">
                      {SURVEY_NG_REASONS.map(r => {
                        const selected = (ngReasonsByDate[activeDate!] ?? []).includes(r.key)
                        return (
                          <button key={r.key} type="button"
                            onClick={() => {
                              setNgReasonsByDate(prev => {
                                const cur = prev[activeDate!] ?? []
                                const next = selected ? cur.filter(k => k !== r.key) : [...cur, r.key]
                                return { ...prev, [activeDate!]: next }
                              })
                            }}
                            className={[
                              'text-xs px-3 py-1.5 rounded-full border transition-colors',
                              selected
                                ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-800 dark:border-gray-200'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-500',
                            ].join(' ')}
                          >
                            {r.label}
                          </button>
                        )
                      })}
                    </div>
                    {(ngReasonsByDate[activeDate!] ?? []).includes('other') && (
                      <input
                        type="text"
                        value={ngNoteByDate[activeDate!] ?? ''}
                        onChange={e => setNgNoteByDate(prev => ({ ...prev, [activeDate!]: e.target.value }))}
                        placeholder="その他の理由を入力"
                        className="mt-2 w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-400"
                      />
                    )}
                  </div>
                )}
                {hasMaybe && (
                  <div>
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-2">△の理由（任意・複数選択可）</p>
                    <div className="flex flex-wrap gap-2">
                      {SURVEY_MAYBE_REASONS.map(r => {
                        const selected = (maybeReasonsByDate[activeDate!] ?? []).includes(r.key)
                        return (
                          <button key={r.key} type="button"
                            onClick={() => {
                              setMaybeReasonsByDate(prev => {
                                const cur = prev[activeDate!] ?? []
                                const next = selected ? cur.filter(k => k !== r.key) : [...cur, r.key]
                                return { ...prev, [activeDate!]: next }
                              })
                            }}
                            className={[
                              'text-xs px-3 py-1.5 rounded-full border transition-colors',
                              selected
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:border-amber-500',
                            ].join(' ')}
                          >
                            {r.label}
                          </button>
                        )
                      })}
                    </div>
                    {(maybeReasonsByDate[activeDate!] ?? []).includes('other') && (
                      <input
                        type="text"
                        value={maybeNoteByDate[activeDate!] ?? ''}
                        onChange={e => setMaybeNoteByDate(prev => ({ ...prev, [activeDate!]: e.target.value }))}
                        placeholder="その他の理由を入力"
                        className="mt-2 w-full text-sm border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* サマリー */}
        <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            ○ <span className="font-bold text-lg text-teal-600 dark:text-teal-300">{okCount}</span> コマ
            　△ <span className="font-bold text-lg text-amber-500">{maybeCount}</span> コマ
          </p>
          {(okCount > 0 || maybeCount > 0) && (
            <button type="button"
              onClick={() => {
                setOkSlots({})
                setMaybeSlots({})
                setNgReasonsByDate({})
                setNgNoteByDate({})
                setMaybeReasonsByDate({})
                setMaybeNoteByDate({})
                setOpenedDates(new Set())
                setActiveDate(null)
              }}
              className="text-xs text-blue-500 hover:text-blue-700">全解除</button>
          )}
        </div>

        <button type="button" onClick={handleSubmit} disabled={isPending}
          className="w-full bg-navy text-white font-semibold py-4 rounded-xl hover:bg-navy-light transition-colors disabled:opacity-50 text-base">
          {isPending ? '送信中...' : '回答を送信する'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">あなたの名前を選んでください</p>
        <div className="space-y-2">
          {tokens.map((token) => (
            <button key={token.id} type="button" onClick={() => handleSelectTeacher(token)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-navy hover:bg-blue-50 transition-colors text-left group">
              <span className="font-medium text-gray-800 dark:text-gray-100 group-hover:text-navy">
                {token.teacher?.name ?? '—'} 先生
              </span>
              {token.responded_at ? (
                <span className="text-xs bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-full font-medium flex-shrink-0">✓ 回答済み（修正可）</span>
              ) : (
                <span className="text-xs text-gray-400 flex-shrink-0">未回答 →</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-center text-gray-400">回答済みの先生も選択すると内容を更新できます</p>
    </div>
  )
}
