'use client'

import { useState, useEffect, useTransition } from 'react'
import { getDailyNote, saveDailyNote } from '@/app/(dashboard)/schedule/daily-notes/actions'

export function DailyNoteEditor({ date }: { date: string }) {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getDailyNote(date).then((r) => setContent(r.content))
  }, [date])

  function handleSave() {
    startTransition(async () => {
      await saveDailyNote(date, content)
      setSaved(true)
    })
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-amber-700 dark:text-amber-300">連絡事項・当番メモ</span>
        {!saved && <span className="text-[10px] text-amber-600 dark:text-amber-300">未保存</span>}
      </div>
      <textarea
        className="w-full text-sm border border-amber-200 dark:border-amber-900 rounded p-2 bg-white dark:bg-gray-800 resize-y min-h-[60px]"
        placeholder="例）自転車整理 A班：田中・鈴木／自習は14時以降OK"
        value={content}
        onChange={(e) => { setContent(e.target.value); setSaved(false) }}
        onBlur={handleSave}
      />
      {isPending && <p className="text-[10px] text-gray-400 mt-1">保存中...</p>}
    </div>
  )
}
