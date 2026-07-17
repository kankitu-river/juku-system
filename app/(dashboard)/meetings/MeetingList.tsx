'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createMeeting, deleteMeeting } from './actions'

interface Meeting {
  id: string
  title: string
  meeting_date: string
  summary: string | null
}

export function MeetingList({ meetings }: { meetings: Meeting[] }) {
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await createMeeting(fd)
      if (result.error) { setError(result.error); return }
      setShowForm(false)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">議事録一覧</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 text-sm bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + 新しい議事録
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">タイトル</label>
              <input name="title" required className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">開催日</label>
              <input name="meeting_date" type="date" required className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">メモ（後から編集可）</label>
            <textarea name="raw_text" rows={3} className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {isPending ? '作成中…' : '作成'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              キャンセル
            </button>
          </div>
        </form>
      )}

      {meetings.length === 0 && !showForm && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">議事録はまだありません</p>
      )}

      <div className="space-y-2">
        {meetings.map((m) => (
          <MeetingRow key={m.id} meeting={m} />
        ))}
      </div>
    </div>
  )
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  const [deleting, startDelete] = useTransition()

  function handleDelete() {
    if (!confirm('この議事録を削除しますか？')) return
    startDelete(async () => { await deleteMeeting(meeting.id) })
  }

  return (
    <div className="group bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/meetings/${meeting.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-400">{meeting.meeting_date}</span>
            {meeting.summary && (
              <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded font-bold">要約済み</span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{meeting.title}</p>
          {meeting.summary && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{meeting.summary}</p>
          )}
        </Link>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 transition-all"
        >
          削除
        </button>
      </div>
    </div>
  )
}
