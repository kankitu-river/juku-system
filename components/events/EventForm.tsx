'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import type { Teacher } from '@/types'
import type { EventFormData } from '@/app/(dashboard)/events/actions'

interface EventFormProps {
  event?: {
    id: string
    title: string
    description: string | null
    start_at: string
    end_at: string
    teacher_id: string | null
  }
  teachers: Teacher[]
  onSave: (data: EventFormData) => Promise<{ error?: string }>
  onDelete?: () => Promise<{ error?: string }>
}

function toLocalDatetimeString(isoStr: string) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EventForm({ event, teachers, onSave, onDelete }: EventFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const [error, setError] = useState<string>()

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const defaultStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T09:00`
  const defaultEnd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T17:00`

  const [form, setForm] = useState<EventFormData>({
    title: event?.title ?? '',
    description: event?.description ?? '',
    start_at: event ? toLocalDatetimeString(event.start_at) : defaultStart,
    end_at: event ? toLocalDatetimeString(event.end_at) : defaultEnd,
    teacher_id: event?.teacher_id ?? '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.end_at <= form.start_at) { setError('終了時刻は開始時刻より後にしてください'); return }
    setError(undefined)
    startTransition(async () => {
      const result = await onSave({
        ...form,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
      })
      if (result.error) { setError(result.error) } else { router.push('/events'); router.refresh() }
    })
  }

  function handleDelete() {
    if (!onDelete || !confirm('このイベントを削除しますか？')) return
    startDeleting(async () => {
      const result = await onDelete()
      if (result.error) { setError(result.error) } else { router.push('/events'); router.refresh() }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          タイトル <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="例：夏期特別講習"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            開始日時 <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            required
            value={form.start_at}
            onChange={(e) => setForm({ ...form, start_at: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            終了日時 <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            required
            value={form.end_at}
            onChange={(e) => setForm({ ...form, end_at: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">担当講師</label>
        <select
          value={form.teacher_id}
          onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
        >
          <option value="">— 未割り当て —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">説明・備考</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="イベントの詳細や注意事項など"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] resize-none"
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-3">
          <Button type="submit" loading={isPending}>{event ? '更新する' : '作成する'}</Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>キャンセル</Button>
        </div>
        {onDelete && (
          <Button type="button" variant="danger" loading={isDeleting} onClick={handleDelete}>削除</Button>
        )}
      </div>
    </form>
  )
}
