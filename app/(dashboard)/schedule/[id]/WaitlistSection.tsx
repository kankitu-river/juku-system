'use client'

import { useState, useTransition } from 'react'
import { addToWaitlist, promoteFromWaitlist, cancelWaitlist } from '../waitlist/actions'

interface WaitlistEntry {
  id: string
  position: number
  notes: string | null
  created_at: string
  student: { id: string; name: string; grade: string } | null
}

interface Student {
  id: string
  name: string
  grade: string
}

interface WaitlistSectionProps {
  lessonId: string
  entries: WaitlistEntry[]
  availableStudents: Student[]
  hasCapacity: boolean
}

function gradeLabel(grade: string) {
  const map: Record<string, string> = {
    elem1:'小1',elem2:'小2',elem3:'小3',elem4:'小4',elem5:'小5',elem6:'小6',
    mid1:'中1',mid2:'中2',mid3:'中3',
    high1:'高1',high2:'高2',high3:'高3',other:'その他',
  }
  return map[grade] ?? grade
}

export function WaitlistSection({ lessonId, entries, availableStudents, hasCapacity }: WaitlistSectionProps) {
  const [pending, startTransition] = useTransition()
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStudentId) return
    setError(null)
    startTransition(async () => {
      const result = await addToWaitlist(lessonId, selectedStudentId, notes || undefined)
      if (result.error) setError(result.error)
      else { setSelectedStudentId(''); setNotes('') }
    })
  }

  function handlePromote(entry: WaitlistEntry) {
    if (!entry.student) return
    startTransition(async () => {
      const result = await promoteFromWaitlist(entry.id, lessonId, entry.student!.id)
      if (result.error) alert(result.error)
    })
  }

  function handleCancel(entryId: string) {
    if (!confirm('キャンセル待ちを取り消しますか？')) return
    startTransition(async () => {
      await cancelWaitlist(entryId, lessonId)
    })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
      <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 text-sm flex items-center gap-2">
        キャンセル待ち
        {entries.length > 0 && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
            {entries.length}名
          </span>
        )}
      </h3>

      {entries.length === 0 ? (
        <p className="text-xs text-gray-400 mb-3">キャンセル待ちはいません</p>
      ) : (
        <div className="space-y-2 mb-4">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {entry.position}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-gray-800 dark:text-gray-100">{entry.student?.name ?? '—'}</span>
                <span className="ml-1.5 text-xs text-gray-400">{gradeLabel(entry.student?.grade ?? '')}</span>
                {entry.notes && <p className="text-[11px] text-gray-400 truncate">{entry.notes}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {hasCapacity && entry.position === 1 && (
                  <button
                    onClick={() => handlePromote(entry)}
                    disabled={pending}
                    className="text-xs bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900 px-2 py-0.5 rounded-full transition-colors disabled:opacity-50"
                  >
                    繰り上げ
                  </button>
                )}
                <button
                  onClick={() => handleCancel(entry.id)}
                  disabled={pending}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors px-1 disabled:opacity-50"
                >
                  取消
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 追加フォーム */}
      <form onSubmit={handleAdd} className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
        <select
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
          className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-300"
        >
          <option value="">生徒を選択...</option>
          {availableStudents.map((s) => (
            <option key={s.id} value={s.id}>{s.name}（{gradeLabel(s.grade)}）</option>
          ))}
        </select>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="備考（任意）"
          className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={pending || !selectedStudentId}
          className="w-full text-sm bg-purple-600 dark:bg-purple-700 text-white rounded-lg py-1.5 font-medium hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors disabled:opacity-50"
        >
          キャンセル待ちに追加
        </button>
      </form>
    </div>
  )
}
