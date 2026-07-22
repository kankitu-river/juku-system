'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Booth } from '@/types'
import { addBooth, deleteBooth, toggleBoothActive, toggleBoothType, swapBoothOrder, updateBoothName } from './actions'

interface BoothSettingsProps {
  booths: Booth[]
}

export function BoothSettings({ booths }: BoothSettingsProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isPending, startTransition] = useTransition()

  const sorted = [...booths].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  function refresh() { router.refresh() }

  function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setError('')
    startTransition(async () => {
      const res = await addBooth(name)
      if (res.error) { setError(res.error); return }
      setNewName('')
      refresh()
    })
  }

  function handleDelete(id: string) {
    if (!confirm('このブースを削除しますか？')) return
    startTransition(async () => {
      const res = await deleteBooth(id)
      if (res.error) { setError(res.error); return }
      refresh()
    })
  }

  function handleToggle(id: string, current: boolean) {
    startTransition(async () => {
      await toggleBoothActive(id, !current)
      refresh()
    })
  }

  function handleToggleType(id: string, current: 'individual' | 'group_preferred') {
    const next = current === 'group_preferred' ? 'individual' : 'group_preferred'
    startTransition(async () => {
      await toggleBoothType(id, next)
      refresh()
    })
  }

  function handleMoveUp(idx: number) {
    if (idx === 0) return
    const a = sorted[idx]
    const b = sorted[idx - 1]
    startTransition(async () => {
      await swapBoothOrder(a.id, a.sort_order, b.id, b.sort_order)
      refresh()
    })
  }

  function handleMoveDown(idx: number) {
    if (idx === sorted.length - 1) return
    const a = sorted[idx]
    const b = sorted[idx + 1]
    startTransition(async () => {
      await swapBoothOrder(a.id, a.sort_order, b.id, b.sort_order)
      refresh()
    })
  }

  function handleNameSave(id: string) {
    const name = editingName.trim()
    if (!name) return
    setEditingId(null)
    startTransition(async () => {
      await updateBoothName(id, name)
      refresh()
    })
  }

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-navy dark:text-blue-300 border border-navy rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        ブースを管理
      </button>

      {open && (
        <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">ブース一覧</h3>

          {error && (
            <div className="mb-3 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="space-y-1.5 mb-4">
            {sorted.map((booth, idx) => (
              <div key={booth.id} className={[
                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                booth.is_active ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-700',
              ].join(' ')}>
                {/* 並び替えボタン */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleMoveUp(idx)}
                    disabled={idx === 0 || isPending}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none text-[10px]"
                  >▲</button>
                  <button
                    onClick={() => handleMoveDown(idx)}
                    disabled={idx === sorted.length - 1 || isPending}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none text-[10px]"
                  >▼</button>
                </div>

                {/* 名前 */}
                {editingId === booth.id ? (
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      autoFocus
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleNameSave(booth.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="flex-1 border border-teal-400 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button onClick={() => handleNameSave(booth.id)} className="text-teal-600 dark:text-teal-300 hover:text-teal-800 text-xs font-bold">✓</button>
                    <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                  </div>
                ) : (
                  <span
                    className={['flex-1 cursor-pointer hover:text-navy', !booth.is_active ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'].join(' ')}
                    onClick={() => { setEditingId(booth.id); setEditingName(booth.name) }}
                    title="クリックで名前を変更"
                  >
                    {booth.name}
                  </span>
                )}

                {/* 有効/無効トグル */}
                <button
                  onClick={() => handleToggle(booth.id, booth.is_active)}
                  disabled={isPending}
                  className={[
                    'text-xs px-2 py-0.5 rounded-full border transition-colors',
                    booth.is_active
                      ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-900 hover:bg-teal-100'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200',
                  ].join(' ')}
                >
                  {booth.is_active ? '稼働中' : '無効'}
                </button>

                {/* 集団優先トグル */}
                <button
                  onClick={() => handleToggleType(booth.id, booth.booth_type ?? 'individual')}
                  disabled={isPending}
                  title={booth.booth_type === 'group_preferred' ? '集団優先ブース（クリックで解除）' : '個別ブース（クリックで集団優先に変更）'}
                  className={[
                    'text-xs px-2 py-0.5 rounded-full border transition-colors',
                    booth.booth_type === 'group_preferred'
                      ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 hover:bg-purple-200'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:border-purple-300 hover:text-purple-600',
                  ].join(' ')}
                >
                  {booth.booth_type === 'group_preferred' ? '集団優先' : '個別'}
                </button>

                {/* 削除 */}
                <button
                  onClick={() => handleDelete(booth.id)}
                  disabled={isPending}
                  className="text-red-400 hover:text-red-600 text-xs disabled:opacity-30"
                  title="削除"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* 追加フォーム */}
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="新しいブース名"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || isPending}
              className="px-3 py-1.5 bg-navy text-white text-sm rounded-lg hover:bg-navy-light disabled:opacity-40 transition-colors"
            >
              + 追加
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
