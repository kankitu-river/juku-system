'use client'

import { useState, useTransition } from 'react'
import { updateTaskStatus, createManualTask, deleteTask } from './actions'

interface Task {
  id: string
  title: string
  description: string | null
  due_date: string
  status: 'pending' | 'in_progress' | 'done' | 'skipped'
  completed_at: string | null
  template_id: string | null
}

function daysUntil(dueDateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDateStr)
  due.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - today.getTime()) / 86400000)
}

function DueBadge({ dueDateStr, status }: { dueDateStr: string; status: string }) {
  if (status === 'done' || status === 'skipped') return null
  const days = daysUntil(dueDateStr)
  const d = new Date(dueDateStr)
  const label = `${d.getMonth() + 1}/${d.getDate()}`
  if (days < 0) {
    return (
      <span className="text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full">
        {Math.abs(days)}日超過 ({label})
      </span>
    )
  }
  if (days === 0) {
    return <span className="text-[11px] font-bold text-orange-600 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded-full">今日締め切り</span>
  }
  if (days <= 3) {
    return (
      <span className="text-[11px] font-bold text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
        あと{days}日 ({label})
      </span>
    )
  }
  return (
    <span className="text-[11px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
      {label}まで
    </span>
  )
}

function TaskRow({ task, onUpdated }: { task: Task; onUpdated: () => void }) {
  const [pending, startTransition] = useTransition()

  function setStatus(s: Task['status']) {
    startTransition(async () => {
      await updateTaskStatus(task.id, s)
      onUpdated()
    })
  }

  function remove() {
    if (!confirm('このタスクを削除しますか？')) return
    startTransition(async () => {
      await deleteTask(task.id)
      onUpdated()
    })
  }

  const isDone = task.status === 'done' || task.status === 'skipped'

  return (
    <div className={['flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 group', isDone ? 'opacity-50' : ''].join(' ')}>
      {/* チェックボックス相当 */}
      <button
        onClick={() => setStatus(isDone ? 'pending' : 'done')}
        disabled={pending}
        className={[
          'mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors flex items-center justify-center',
          isDone
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 dark:border-gray-500 hover:border-green-400',
        ].join(' ')}
      >
        {isDone && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={['text-sm font-medium', isDone ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-100'].join(' ')}>
            {task.title}
          </span>
          <DueBadge dueDateStr={task.due_date} status={task.status} />
          {task.status === 'in_progress' && (
            <span className="text-[11px] text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full font-medium">対応中</span>
          )}
          {task.status === 'skipped' && (
            <span className="text-[11px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">スキップ</span>
          )}
        </div>
        {task.description && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{task.description}</p>
        )}
      </div>

      {/* アクション */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isDone && task.status !== 'in_progress' && (
          <button
            onClick={() => setStatus('in_progress')}
            disabled={pending}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-1"
          >
            対応中
          </button>
        )}
        {!isDone && (
          <button
            onClick={() => setStatus('skipped')}
            disabled={pending}
            className="text-xs text-gray-400 hover:underline px-1"
          >
            スキップ
          </button>
        )}
        {!task.template_id && (
          <button
            onClick={remove}
            disabled={pending}
            className="text-xs text-red-400 hover:text-red-600 px-1"
          >
            削除
          </button>
        )}
      </div>
    </div>
  )
}

function AddTaskForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !dueDate) return
    startTransition(async () => {
      await createManualTask({ title: title.trim(), description: description.trim() || undefined, due_date: dueDate })
      setTitle('')
      setDueDate('')
      setDescription('')
      setOpen(false)
      onAdded()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left text-sm text-gray-400 hover:text-navy dark:hover:text-blue-300 py-2 transition-colors"
      >
        + タスクを手動追加
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="タスク名"
        required
        className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-navy/30"
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="説明（任意）"
        className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-navy/30"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        required
        className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-navy/30"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 text-sm bg-navy dark:bg-blue-700 text-white rounded-lg py-1.5 font-medium hover:bg-navy/90 transition-colors disabled:opacity-50"
        >
          追加
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-gray-500 px-4 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          キャンセル
        </button>
      </div>
    </form>
  )
}

export function TaskList({ initialTasks }: { initialTasks: Task[] }) {
  const [, startTransition] = useTransition()

  function refresh() {
    startTransition(() => {})
  }

  const active = initialTasks.filter((t) => t.status === 'pending' || t.status === 'in_progress')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const completed = initialTasks.filter((t) => t.status === 'done' || t.status === 'skipped')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))

  return (
    <div>
      <div>
        {active.length === 0 && (
          <p className="text-sm text-gray-400 py-4 text-center">未完了のタスクはありません</p>
        )}
        {active.map((t) => (
          <TaskRow key={t.id} task={t} onUpdated={refresh} />
        ))}
      </div>

      <AddTaskForm onAdded={refresh} />

      {completed.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 select-none">
            完了済み・スキップ（{completed.length}件）
          </summary>
          <div className="mt-2">
            {completed.map((t) => (
              <TaskRow key={t.id} task={t} onUpdated={refresh} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
