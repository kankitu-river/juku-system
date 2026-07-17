'use client'

import { useState, useTransition } from 'react'
import { createSchoolEvent, deleteSchoolEvent } from './actions'

interface SchoolEvent {
  id: string
  school_name: string
  event_type: string
  title: string
  start_date: string
  end_date: string
  notes: string | null
}

const EVENT_TYPES = ['定期テスト', '行事', '休校', 'その他']
const TYPE_COLORS: Record<string, string> = {
  '定期テスト': 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300',
  '行事': 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300',
  '休校': 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  'その他': 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300',
}

export function SchoolEventManager({ initialEvents }: { initialEvents: SchoolEvent[] }) {
  const [events, setEvents] = useState(initialEvents)
  const [showForm, setShowForm] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    school_name: '',
    event_type: '定期テスト',
    title: '',
    start_date: '',
    end_date: '',
    notes: '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createSchoolEvent(form)
      if (result.error) { setError(result.error); return }
      setShowForm(false)
      setForm({ school_name: '', event_type: '定期テスト', title: '', start_date: '', end_date: '', notes: '' })
    })
  }

  function handleDelete(id: string) {
    if (!confirm('この行事を削除しますか？')) return
    startTransition(async () => {
      await deleteSchoolEvent(id)
      setEvents((prev) => prev.filter((e) => e.id !== id))
    })
  }

  const grouped = events.reduce((acc, e) => {
    const key = e.school_name
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {} as Record<string, SchoolEvent[]>)

  const inputClass = 'w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-navy/30'

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-navy dark:bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-navy/90 transition-colors"
        >
          + 行事を追加
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">学校行事を追加</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">学校名</label>
              <input type="text" required value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} placeholder="○○中学校" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">種別</label>
              <select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} className={inputClass}>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">タイトル</label>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="1学期中間テスト" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">開始日</label>
              <input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">終了日</label>
              <input type="date" required value={form.end_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">備考（任意）</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="flex-1 text-sm bg-navy dark:bg-blue-700 text-white rounded-lg py-1.5 font-medium hover:bg-navy/90 transition-colors disabled:opacity-50">追加</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-4 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">キャンセル</button>
          </div>
        </form>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center text-gray-400 text-sm">
          学校行事が登録されていません
        </div>
      ) : (
        Object.entries(grouped).map(([school, evts]) => (
          <div key={school} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{school}</h3>
            <div className="space-y-2">
              {evts.sort((a, b) => a.start_date.localeCompare(b.start_date)).map((evt) => (
                <div key={evt.id} className="flex items-center gap-3 py-1.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0 group">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${TYPE_COLORS[evt.event_type] ?? TYPE_COLORS['その他']}`}>
                    {evt.event_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-800 dark:text-gray-100">{evt.title}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {evt.start_date === evt.end_date
                        ? new Date(evt.start_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
                        : `${new Date(evt.start_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}〜${new Date(evt.end_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}`
                      }
                    </span>
                    {evt.notes && <span className="ml-2 text-xs text-gray-400">{evt.notes}</span>}
                  </div>
                  <button onClick={() => handleDelete(evt.id)} disabled={pending} className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50">削除</button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
