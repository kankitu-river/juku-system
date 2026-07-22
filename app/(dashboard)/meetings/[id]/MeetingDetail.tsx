'use client'

import { useState, useTransition } from 'react'
import { generateMeetingSummary, updateMeetingText, updateMeetingSummary, toggleMeetingTask } from '../actions'

interface MeetingTask {
  id: string
  title: string
  assignee: string | null
  due_date: string | null
  status: string
}

interface Props {
  id: string
  title: string
  meeting_date: string
  raw_text: string
  summary: string | null
  tasks: MeetingTask[]
}

const FORMAT_GUIDE = `書き方ガイド：★ または【決定】→ 決定事項 ／ ・ - □ TODO: → タスク行 ／ @担当者 (月/日) で担当者と期限を自動抽出`

export function MeetingDetail({ id, title, meeting_date, raw_text: initialText, summary: initialSummary, tasks: initialTasks }: Props) {
  const [rawText, setRawText] = useState(initialText)
  const [summary, setSummary] = useState(initialSummary ?? '')
  const [tasks, setTasks] = useState(initialTasks)
  const [dirty, setDirty] = useState(false)
  const [summaryDirty, setSummaryDirty] = useState(false)
  const [isSaving, startSave] = useTransition()
  const [isSavingSummary, startSaveSummary] = useTransition()
  const [isGenerating, startGenerate] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [genInfo, setGenInfo] = useState<string | null>(null)

  function handleTextChange(v: string) {
    setRawText(v)
    setDirty(true)
    setGenInfo(null)
  }

  function handleSummaryChange(v: string) {
    setSummary(v)
    setSummaryDirty(true)
  }

  function handleSave() {
    setError(null)
    startSave(async () => {
      const result = await updateMeetingText(id, rawText)
      if (result.error) { setError(result.error); return }
      setDirty(false)
    })
  }

  function handleSaveSummary() {
    setError(null)
    startSaveSummary(async () => {
      const result = await updateMeetingSummary(id, summary)
      if (result.error) { setError(result.error); return }
      setSummaryDirty(false)
    })
  }

  function handleGenerate() {
    setError(null)
    setGenInfo(null)
    startGenerate(async () => {
      if (dirty) {
        const saveResult = await updateMeetingText(id, rawText)
        if (saveResult.error) { setError(saveResult.error); return }
        setDirty(false)
      }
      const result = await generateMeetingSummary(id)
      if (result.error) { setError(result.error); return }
      setSummary(result.summary ?? '')
      setSummaryDirty(false)
      setGenInfo(`${result.taskCount ?? 0}件のタスクを抽出しました`)
    })
  }

  function handleToggle(taskId: string, done: boolean) {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: done ? 'done' : 'pending' } : t))
    toggleMeetingTask(taskId, done)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-gray-400">{meeting_date}</span>
        </div>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">{title}</h2>

        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5">メモ</label>
        <textarea
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          rows={10}
          placeholder="ミーティングの内容をここに書いてください..."
          className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
        />

        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed">{FORMAT_GUIDE}</p>

        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

        <div className="flex gap-2 mt-3 flex-wrap">
          {dirty && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {isSaving ? '保存中…' : '保存'}
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !rawText.trim()}
            className="px-4 py-1.5 text-sm bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isGenerating ? '解析中…' : '解析・タスク抽出'}
          </button>
          {genInfo && <span className="self-center text-xs text-green-600 dark:text-green-400">{genInfo}</span>}
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">要約</h3>
        <textarea
          value={summary}
          onChange={(e) => handleSummaryChange(e.target.value)}
          rows={3}
          placeholder="解析ボタンで自動生成、または手動で編集できます"
          className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
        />
        {summaryDirty && (
          <button
            onClick={handleSaveSummary}
            disabled={isSavingSummary}
            className="mt-2 px-4 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {isSavingSummary ? '保存中…' : '要約を保存'}
          </button>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            抽出タスク
            <span className="ml-2 text-xs font-normal text-gray-400">({tasks.filter((t) => t.status === 'done').length}/{tasks.length} 完了)</span>
          </h3>
          <div className="space-y-2">
            {tasks.map((task) => (
              <label key={task.id} className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onChange={(e) => handleToggle(task.id, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-100'}`}>
                    {task.title}
                  </span>
                  <div className="flex gap-3 mt-0.5">
                    {task.assignee && (
                      <span className="text-xs text-gray-400">担当: {task.assignee}</span>
                    )}
                    {task.due_date && (
                      <span className="text-xs text-gray-400">期限: {task.due_date}</span>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
