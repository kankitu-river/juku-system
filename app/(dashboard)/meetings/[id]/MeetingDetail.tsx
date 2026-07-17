'use client'

import { useState, useTransition } from 'react'
import { generateMeetingSummary, updateMeetingText, toggleMeetingTask } from '../actions'

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

export function MeetingDetail({ id, title, meeting_date, raw_text: initialText, summary: initialSummary, tasks: initialTasks }: Props) {
  const [rawText, setRawText] = useState(initialText)
  const [summary, setSummary] = useState(initialSummary)
  const [tasks, setTasks] = useState(initialTasks)
  const [dirty, setDirty] = useState(false)
  const [isSaving, startSave] = useTransition()
  const [isGenerating, startGenerate] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [genInfo, setGenInfo] = useState<string | null>(null)

  function handleTextChange(v: string) {
    setRawText(v)
    setDirty(true)
    setGenInfo(null)
  }

  function handleSave() {
    setError(null)
    startSave(async () => {
      const result = await updateMeetingText(id, rawText)
      if (result.error) { setError(result.error); return }
      setDirty(false)
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
      setSummary(result.summary ?? null)
      setGenInfo(`${result.taskCount ?? 0}件のタスクを抽出しました`)
      // revalidatePath が page を更新するが client state も更新
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

        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

        <div className="flex gap-2 mt-3">
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
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-violet-600 dark:bg-violet-700 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            <span className="text-[10px] font-bold bg-violet-400/40 rounded px-1">AI</span>
            {isGenerating ? '解析中…' : '要約・タスク抽出'}
          </button>
          {genInfo && <span className="self-center text-xs text-green-600 dark:text-green-400">{genInfo}</span>}
        </div>
      </div>

      {summary && (
        <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200 px-1.5 py-0.5 rounded font-bold">AI生成</span>
            <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-200">要約</h3>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{summary}</p>
        </div>
      )}

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
