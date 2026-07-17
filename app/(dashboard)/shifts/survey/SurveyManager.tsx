'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { createSurvey, deleteSurvey, sendSurveyEmails, importSurveyToShifts, getShiftPredictions } from './actions'

interface Token {
  id: string
  token: string
  teacher_id: string
  responded_at: string | null
  teacher: { id: string; name: string } | null
}

interface Survey {
  id: string
  target_month: string
  deadline: string
  term_type?: string
  term_period_id?: string | null
  created_at: string
  tokens: Token[]
}

interface IntensivePeriod {
  id: string
  name: string
  start_date: string
  end_date: string
}

type ResponseEntry = { teacherId: string; availableSlots: Record<string, number[]> }

interface SurveyManagerProps {
  surveys: Survey[]
  teacherCount: number
  intensivePeriods: IntensivePeriod[]
  responsesBySurvey?: Record<string, ResponseEntry[]>
}

const DOW_NAMES = ['日', '月', '火', '水', '木', '金', '土']

function ResponseSummary({ tokens, responses }: { tokens: Token[]; responses: ResponseEntry[] }) {
  if (tokens.length === 0) return null

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 mt-4 pt-4">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-3">回答内容（インポート前に確認できます）</p>
      <div className="space-y-3">
        {tokens.map((token) => {
          const res = responses.find((r) => r.teacherId === token.teacher_id)
          if (!res) {
            return (
              <div key={token.id} className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300 w-20 shrink-0">{token.teacher?.name}</span>
                <span className="text-xs text-gray-300">未回答</span>
              </div>
            )
          }

          // 日付ごとにソートして表示
          const dateEntries = Object.entries(res.availableSlots)
            .filter(([, slots]) => slots && slots.length > 0)
            .sort(([a], [b]) => a.localeCompare(b))

          return (
            <div key={token.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">{token.teacher?.name}</span>
                <span className="text-xs text-green-600 dark:text-green-300 font-medium">✓ {dateEntries.length}日間</span>
              </div>
              {dateEntries.length > 0 && (
                <div className="flex flex-wrap gap-1 ml-20">
                  {dateEntries.map(([dateStr, slots]) => {
                    const d = new Date(dateStr + 'T12:00:00')
                    const label = `${d.getMonth() + 1}/${d.getDate()}（${DOW_NAMES[d.getDay()]}）`
                    return (
                      <span key={dateStr} className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 text-blue-700 dark:text-blue-300 text-[10px] px-2 py-0.5 rounded-full">
                        <span className="font-bold">{label}</span>
                        第{[...slots].sort((a, b) => a - b).join('・')}コマ
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SurveyManager({ surveys: initialSurveys, teacherCount, intensivePeriods, responsesBySurvey = {} }: SurveyManagerProps) {
  const router = useRouter()
  const toast = useToast()
  const [surveys, setSurveys] = useState(initialSurveys)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [predictions, setPredictions] = useState<Record<string, { dow: number; frequency: number }[]> | null>(null)
  const [isPredicting, startPredicting] = useTransition()

  function handlePredict() {
    const allTokens = surveys.flatMap((s) => s.tokens ?? [])
    const teacherIds = [...new Set(allTokens.map((t) => t.teacher_id))]
    if (teacherIds.length === 0) return
    startPredicting(async () => {
      const result = await getShiftPredictions(teacherIds)
      setPredictions(result)
    })
  }

  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 2).padStart(2, '0')}`
  const defaultDeadlineDate = new Date(today.getFullYear(), today.getMonth() + 1, 10)
  const defaultDeadline = `${defaultDeadlineDate.getFullYear()}-${String(defaultDeadlineDate.getMonth() + 1).padStart(2, '0')}-${String(defaultDeadlineDate.getDate()).padStart(2, '0')}`

  const [form, setForm] = useState({
    target_month: defaultMonth,
    deadline: defaultDeadline,
    term_type: 'regular' as 'regular' | 'intensive',
    term_period_id: '',
  })

  function handlePeriodSelect(periodId: string) {
    const period = intensivePeriods.find((p) => p.id === periodId)
    if (!period) {
      setForm((f) => ({ ...f, term_period_id: periodId }))
      return
    }
    const startDate = new Date(period.start_date + 'T12:00:00')
    const targetMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`
    const deadlineDate = new Date(startDate)
    deadlineDate.setDate(deadlineDate.getDate() - 7)
    const deadline = deadlineDate.toISOString().split('T')[0]
    setForm((f) => ({ ...f, term_period_id: periodId, target_month: targetMonth, deadline }))
  }

  function handleTermTypeToggle(termType: 'regular' | 'intensive') {
    setForm((f) => ({ ...f, term_type: termType, term_period_id: '' }))
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (form.term_type === 'intensive' && !form.term_period_id) {
      setError('講習期間を選択してください')
      return
    }
    setError(undefined)
    startTransition(async () => {
      const payload = {
        target_month: form.target_month,
        deadline: form.deadline,
        term_type: form.term_type,
        ...(form.term_period_id ? { term_period_id: form.term_period_id } : {}),
      }
      const result = await createSurvey(payload)
      if (result.error) { setError(result.error); return }
      setShowForm(false)
      setForm({ target_month: defaultMonth, deadline: defaultDeadline, term_type: 'regular', term_period_id: '' })
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    if (!confirm('このアンケートを削除しますか？')) return
    startTransition(async () => {
      await deleteSurvey(id)
      setSurveys(surveys.filter((s) => s.id !== id))
    })
  }

  function handleImportToShifts(surveyId: string, respondedCount: number) {
    if (respondedCount === 0) {
      toast.error('まだ誰も回答していません')
      return
    }
    if (!confirm(`回答済み${respondedCount}名分のコマ選択をシフトに反映します。同じ日の既存シフトは上書きされます。続けますか？`)) return
    setError(undefined)
    startTransition(async () => {
      const result = await importSurveyToShifts(surveyId)
      if (result.error) {
        setError(`反映エラー: ${result.error}`)
      } else {
        toast.success(`${result.imported}件のシフトを登録しました${result.skipped > 0 ? `（コマ未選択の日 ${result.skipped} 件はスキップ）` : ''}`)
      }
    })
  }

  function handleSendEmails(surveyId: string) {
    if (!confirm('未回答の先生全員にメールを送信しますか？')) return
    setError(undefined)
    startTransition(async () => {
      const result = await sendSurveyEmails(surveyId)
      if (result.errors.length > 0) {
        setError(`送信エラー: ${result.errors.join(', ')}`)
      } else {
        toast.success(`${result.sent}名にメールを送信しました`)
      }
    })
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const selectedPeriod = intensivePeriods.find((p) => p.id === form.term_period_id)

  return (
    <div className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {/* 来月シフト予測 */}
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={handlePredict} loading={isPredicting}>
          過去3ヶ月の実績から出勤パターンを予測
        </Button>
        {predictions && (
          <button onClick={() => setPredictions(null)} className="text-xs text-gray-400 hover:text-gray-600">✕ 閉じる</button>
        )}
      </div>
      {predictions && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-3">出勤パターン予測（週50%以上の曜日）</h4>
          {Object.keys(predictions).length === 0 ? (
            <p className="text-xs text-blue-600 dark:text-blue-400">過去3ヶ月のシフトデータが不足しています</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(predictions).map(([teacherId, preds]) => {
                const name = surveys.flatMap((s) => s.tokens ?? []).find((t) => t.teacher_id === teacherId)?.teacher?.name ?? teacherId.slice(0, 8)
                return (
                  <div key={teacherId} className="bg-white dark:bg-gray-800 rounded-lg p-2">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">{name}</p>
                    <div className="flex flex-wrap gap-1">
                      {preds.map(({ dow, frequency }) => (
                        <span key={dow} className="text-[11px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                          {DOW_NAMES[dow]}曜 {frequency}%
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-[11px] text-blue-500 dark:text-blue-400 mt-2">※ 参考値です。アンケートで先生本人に確認してください。</p>
        </div>
      )}

      {/* アンケート作成フォーム */}
      {showForm ? (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">新しいアンケートを作成</h3>

          {/* 期間種別 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">期間種別</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleTermTypeToggle('regular')}
                className={[
                  'flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                  form.term_type === 'regular'
                    ? 'bg-navy text-white border-navy'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50',
                ].join(' ')}
              >
                通常期間（3コマ）
              </button>
              <button
                type="button"
                onClick={() => handleTermTypeToggle('intensive')}
                className={[
                  'flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                  form.term_type === 'intensive'
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50',
                ].join(' ')}
              >
                講習期間（7コマ）
              </button>
            </div>
          </div>

          {/* 講習期間選択（講習期間の場合のみ） */}
          {form.term_type === 'intensive' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">対象の講習期間</label>
              {intensivePeriods.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
                  先に「設定」から講習期間を登録してください
                </p>
              ) : (
                <select
                  value={form.term_period_id}
                  onChange={(e) => handlePeriodSelect(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">期間を選択してください...</option>
                  {intensivePeriods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{p.start_date} 〜 {p.end_date}）
                    </option>
                  ))}
                </select>
              )}
              {selectedPeriod && (
                <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                  {selectedPeriod.start_date} 〜 {selectedPeriod.end_date} の全日程がアンケート対象になります
                </p>
              )}
            </div>
          )}

          {/* 対象月・回答期限 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                対象月{form.term_type === 'intensive' && '（自動設定）'}
              </label>
              <input
                type="month"
                required
                value={form.target_month}
                onChange={(e) => setForm((f) => ({ ...f, target_month: e.target.value }))}
                disabled={form.term_type === 'intensive' && !!form.term_period_id}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                回答期限{form.term_type === 'intensive' && '（自動設定）'}
              </label>
              <input
                type="date"
                required
                value={form.deadline}
                onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
              />
            </div>
          </div>

          <p className="text-xs text-gray-400">
            作成すると全先生（{teacherCount}名）分のアンケートリンクが生成されます
          </p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isPending}>作成する</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setShowForm(false); setError(undefined) }}>キャンセル</Button>
          </div>
        </form>
      ) : (
        <Button onClick={() => setShowForm(true)}>+ アンケートを作成</Button>
      )}

      {/* アンケート一覧 */}
      {surveys.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-10 text-center text-gray-400 text-sm">
          アンケートはまだ作成されていません
        </div>
      ) : (
        <div className="space-y-3">
          {surveys.map((survey) => {
            const responded = survey.tokens.filter((t) => t.responded_at).length
            const total = survey.tokens.length
            const isExpanded = expandedId === survey.id
            const isExpired = new Date(survey.deadline) < new Date()
            const termType = survey.term_type ?? 'regular'

            return (
              <div key={survey.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  onClick={() => setExpandedId(isExpanded ? null : survey.id)}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-800 dark:text-gray-100">
                          {survey.target_month.replace('-', '年')}月 出勤アンケート
                        </p>
                        {termType === 'intensive' && (
                          <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">講習</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        期限：{survey.deadline}
                        {isExpired && <span className="ml-2 text-red-400">（締切済み）</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-24 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-400 rounded-full transition-all"
                          style={{ width: total > 0 ? `${(responded / total) * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{responded}/{total}名回答</span>
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-3">回答状況</p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {survey.tokens.map((token) => (
                        <div key={token.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-lg px-3 py-2">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{token.teacher?.name ?? '—'}</span>
                          {token.responded_at ? (
                            <span className="text-xs text-green-600 dark:text-green-300 font-medium">✓ 回答済み</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">未回答</span>
                              <button
                                onClick={() => {
                                  const url = `${baseUrl}/survey/respond?token=${token.token}`
                                  navigator.clipboard.writeText(url)
                                  toast.success('リンクをコピーしました')
                                }}
                                className="text-[10px] text-navy dark:text-blue-300 hover:underline"
                              >
                                リンクコピー
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <ResponseSummary tokens={survey.tokens} responses={responsesBySurvey[survey.id] ?? []} />

                    <div className="flex gap-2 flex-wrap mt-4">
                      <Button
                        size="sm"
                        loading={isPending}
                        onClick={() => handleImportToShifts(survey.id, responded)}
                      >
                        📥 シフトに反映
                      </Button>
                      <Button
                        size="sm"
                        loading={isPending}
                        onClick={() => handleSendEmails(survey.id)}
                      >
                        ✉ メールを一斉送信
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const url = `${baseUrl}/survey/respond?id=${survey.id}`
                          navigator.clipboard.writeText(url)
                          toast.success('共有リンクをコピーしました。LINEやチャットで先生全員に送ってください')
                        }}
                      >
                        📋 共有リンクをコピー
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(survey.id)}
                      >
                        削除
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
