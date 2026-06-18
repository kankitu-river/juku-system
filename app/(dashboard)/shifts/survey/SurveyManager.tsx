'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { createSurvey, deleteSurvey, sendSurveyEmails } from './actions'

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
  created_at: string
  tokens: Token[]
}

interface SurveyManagerProps {
  surveys: Survey[]
  teacherCount: number
}

export function SurveyManager({ surveys: initialSurveys, teacherCount }: SurveyManagerProps) {
  const router = useRouter()
  const [surveys, setSurveys] = useState(initialSurveys)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 2).padStart(2, '0')}`
  const defaultDeadline = new Date(today.getFullYear(), today.getMonth() + 1, 10)
    .toISOString().split('T')[0]

  const [form, setForm] = useState({ target_month: defaultMonth, deadline: defaultDeadline, term_type: 'regular' as 'regular' | 'intensive' })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(undefined)
    startTransition(async () => {
      const result = await createSurvey(form)
      if (result.error) { setError(result.error); return }
      setShowForm(false)
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

  function handleSendEmails(surveyId: string) {
    if (!confirm('未回答の先生全員にメールを送信しますか？')) return
    setError(undefined)
    startTransition(async () => {
      const result = await sendSurveyEmails(surveyId)
      if (result.errors.length > 0) {
        setError(`送信エラー: ${result.errors.join(', ')}`)
      } else {
        alert(`${result.sent}名にメールを送信しました`)
      }
    })
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* アンケート作成フォーム */}
      {showForm ? (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">新しいアンケートを作成</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">対象月</label>
              <input
                type="month"
                required
                value={form.target_month}
                onChange={(e) => setForm({ ...form, target_month: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">回答期限</label>
              <input
                type="date"
                required
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">期間種別</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, term_type: 'regular' })}
                className={[
                  'flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                  form.term_type === 'regular'
                    ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                通常期間（3コマ）
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, term_type: 'intensive' })}
                className={[
                  'flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                  form.term_type === 'intensive'
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                講習期間（7コマ）
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            作成すると全先生（{teacherCount}名）分のアンケートリンクが生成されます
          </p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isPending}>作成する</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>キャンセル</Button>
          </div>
        </form>
      ) : (
        <Button onClick={() => setShowForm(true)}>+ アンケートを作成</Button>
      )}

      {/* アンケート一覧 */}
      {surveys.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
          アンケートはまだ作成されていません
        </div>
      ) : (
        <div className="space-y-3">
          {surveys.map((survey) => {
            const responded = survey.tokens.filter((t) => t.responded_at).length
            const total = survey.tokens.length
            const isExpanded = expandedId === survey.id
            const isExpired = new Date(survey.deadline) < new Date()

            return (
              <div key={survey.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : survey.id)}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {survey.target_month.replace('-', '年')}月 出勤アンケート
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        期限：{survey.deadline}
                        {isExpired && <span className="ml-2 text-red-400">（締切済み）</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-24 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-400 rounded-full transition-all"
                          style={{ width: total > 0 ? `${(responded / total) * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{responded}/{total}名回答</span>
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    <p className="text-xs font-medium text-gray-600 mb-3">回答状況</p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {survey.tokens.map((token) => (
                        <div key={token.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <span className="text-sm text-gray-700">{token.teacher?.name ?? '—'}</span>
                          {token.responded_at ? (
                            <span className="text-xs text-green-600 font-medium">✓ 回答済み</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">未回答</span>
                              <button
                                onClick={() => {
                                  const url = `${baseUrl}/survey/respond?token=${token.token}`
                                  navigator.clipboard.writeText(url)
                                  alert('リンクをコピーしました')
                                }}
                                className="text-[10px] text-[#1E3A5F] hover:underline"
                              >
                                リンクコピー
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 flex-wrap">
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
                          alert('共有リンクをコピーしました\nLINEやチャットで先生全員に送ってください')
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
