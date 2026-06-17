'use client'

import { useState, useTransition } from 'react'
import { submitSurveyResponse } from './actions'

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
  tokens: Token[]
  datesMap: Record<string, string[]>
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

export function SurveyRespond({ surveyId, targetMonth, tokens, datesMap, closureDates = [], preselectedTeacherId }: SurveyRespondProps) {
  const preselected = preselectedTeacherId
    ? tokens.find((t) => t.teacher_id === preselectedTeacherId) ?? null
    : null

  const [step, setStep] = useState<'select' | 'calendar' | 'done'>(preselected ? 'calendar' : 'select')
  const [selectedTeacher, setSelectedTeacher] = useState<Token | null>(preselected)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(
    new Set(preselected ? (datesMap[preselected.teacher_id] ?? []) : [])
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  const days = getDaysInMonth(targetMonth)
  const [year, month] = targetMonth.split('-').map(Number)
  const firstDow = days[0].getDay()

  function handleSelectTeacher(token: Token) {
    setSelectedTeacher(token)
    // 既存の回答があればプリセット
    const existing = datesMap[token.teacher_id] ?? []
    setSelectedDates(new Set(existing))
    setStep('calendar')
  }

  function toggleDate(dateStr: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  function handleSubmit() {
    if (!selectedTeacher) return
    setError(undefined)
    startTransition(async () => {
      const result = await submitSurveyResponse(
        surveyId,
        selectedTeacher.teacher_id,
        Array.from(selectedDates).sort()
      )
      if (result.error) { setError(result.error); return }
      setStep('done')
    })
  }

  // 完了画面
  if (step === 'done') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
        <div className="text-4xl mb-3">✅</div>
        <p className="text-lg font-semibold text-green-800">回答を受け付けました</p>
        <p className="text-sm text-green-600 mt-2">
          {selectedTeacher?.teacher?.name} 先生の回答を登録しました（{selectedDates.size}日間）
        </p>
        <p className="text-xs text-gray-400 mt-4">このページは閉じても大丈夫です</p>
        <button
          onClick={() => setStep('select')}
          className="mt-4 text-sm text-[#1E3A5F] underline"
        >
          別の先生の回答を入力する
        </button>
      </div>
    )
  }

  // カレンダー画面
  if (step === 'calendar' && selectedTeacher) {
    return (
      <div className="space-y-4">
        {/* 戻るボタン + 先生名 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep('select')}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ← 戻る
          </button>
          <div className="bg-[#1E3A5F] text-white px-3 py-1.5 rounded-lg text-sm font-semibold">
            {selectedTeacher.teacher?.name} 先生
          </div>
          {datesMap[selectedTeacher.teacher_id] && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
              回答を更新中
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            {year}年{month}月のカレンダー
            <span className="ml-2 text-xs font-normal text-gray-400">出勤できる日をタップ</span>
          </p>

          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d, i) => (
              <div key={d} className={[
                'text-center text-xs font-medium py-1',
                i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500',
              ].join(' ')}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}
            {days.map((d) => {
              const dateStr = toDateStr(d)
              const dow = d.getDay()
              const isSelected = selectedDates.has(dateStr)
              const isToday = dateStr === toDateStr(new Date())
              const isClosed = closureDates.includes(dateStr)
              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isClosed}
                  onClick={() => !isClosed && toggleDate(dateStr)}
                  className={[
                    'aspect-square rounded-xl text-sm font-medium transition-all flex flex-col items-center justify-center gap-0.5',
                    isClosed
                      ? 'bg-red-100 text-red-400 cursor-not-allowed'
                      : isSelected
                        ? 'bg-[#1E3A5F] text-white shadow-sm'
                        : dow === 0 ? 'text-red-400 hover:bg-red-50'
                        : dow === 6 ? 'text-blue-400 hover:bg-blue-50'
                        : 'text-gray-700 hover:bg-gray-100',
                    isToday && !isSelected && !isClosed ? 'ring-2 ring-[#1E3A5F] ring-offset-1' : '',
                  ].join(' ')}
                >
                  <span>{d.getDate()}</span>
                  {isClosed && <span className="text-[8px] font-bold leading-none">休</span>}
                </button>
              )
            })}
          </div>

          {closureDates.length > 0 && (
            <p className="mt-2 text-xs text-red-400 text-center">
              赤い日は休校日のため選択できません
            </p>
          )}
        </div>

        <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-blue-700">
            <span className="font-bold text-lg text-[#1E3A5F]">{selectedDates.size}</span> 日間選択中
          </p>
          {selectedDates.size > 0 && (
            <button type="button" onClick={() => setSelectedDates(new Set())} className="text-xs text-blue-500 hover:text-blue-700">
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

      <p className="text-xs text-center text-gray-400">
        回答済みの先生も選択すると内容を更新できます
      </p>
    </div>
  )
}
