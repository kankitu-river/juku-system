'use client'

import { useState, useTransition } from 'react'
import type { TermPeriod, TermType } from '@/types'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { createTermPeriod, deleteTermPeriod } from './actions'

interface TermPeriodManagerProps {
  initialPeriods: TermPeriod[]
}

export function TermPeriodManager({ initialPeriods }: TermPeriodManagerProps) {
  const [periods, setPeriods] = useState<TermPeriod[]>(initialPeriods)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  const [form, setForm] = useState({
    name: '',
    type: 'intensive' as TermType,
    start_date: '',
    end_date: '',
  })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(undefined)
    startTransition(async () => {
      const result = await createTermPeriod(form)
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setPeriods([result.data, ...periods])
        setShowForm(false)
        setForm({ name: '', type: 'intensive', start_date: '', end_date: '' })
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('この期間区分を削除しますか？')) return
    startTransition(async () => {
      const result = await deleteTermPeriod(id)
      if (!result.error) {
        setPeriods(periods.filter((p) => p.id !== id))
      }
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {periods.length === 0 && !showForm && (
          <p className="text-sm text-gray-400 text-center py-4">登録された期間区分はありません</p>
        )}
        {periods.map((period) => (
          <div
            key={period.id}
            className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-100 bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <Badge variant={period.type === 'intensive' ? 'intensive' : 'regular'}>
                {period.type === 'intensive' ? '講習' : '通常'}
              </Badge>
              <div>
                <p className="text-sm font-medium text-gray-800">{period.name}</p>
                <p className="text-xs text-gray-400">
                  {period.start_date} 〜 {period.end_date}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDelete(period.id)}
              className="text-red-400 hover:text-red-600 text-sm transition-colors"
            >
              削除
            </button>
          </div>
        ))}
      </div>

      {showForm ? (
        <form onSubmit={handleCreate} className="space-y-3 border border-gray-200 rounded-lg p-4 bg-white">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">期間名</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例：2025年夏期講習"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">種別</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as TermType })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
            >
              <option value="intensive">講習期間</option>
              <option value="regular">通常期間</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開始日</label>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">終了日</label>
              <input
                type="date"
                required
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isPending}>追加</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              キャンセル
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setShowForm(true)}>
          + 期間区分を追加
        </Button>
      )}
    </div>
  )
}
