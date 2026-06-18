'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Teacher, Student } from '@/types'
import { getDisplayGrade } from '@/lib/utils/grade'

interface MonthlyPrintManagerProps {
  teachers: Teacher[]
  students: Student[]
}

type Tab = 'teacher' | 'student'

export function MonthlyPrintManager({ teachers, students }: MonthlyPrintManagerProps) {
  const today = new Date()
  const [tab, setTab] = useState<Tab>('teacher')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')

  function toggleId(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function selectAll() {
    setSelectedIds(filteredList.map((x) => x.id))
  }

  function clearAll() {
    setSelectedIds([])
  }

  function handleOpenPreviews() {
    const ids = selectedIds.length > 0
      ? selectedIds
      : (tab === 'teacher' ? teachers : students).map((x) => x.id)

    for (const id of ids) {
      const url = `/print/monthly/preview?year=${year}&month=${month}&type=${tab}&id=${id}`
      window.open(url, '_blank')
    }
  }

  const currentList = tab === 'teacher' ? teachers : students
  const filteredList = search.trim()
    ? currentList.filter((p) => p.name.includes(search.trim()))
    : currentList

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">対象月を選択</h2>
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">年</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
            >
              {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">月</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>
          <div className="pt-5">
            <span className="text-sm text-gray-500">{year}年{month}月のスケジュールを出力</span>
          </div>
        </div>
      </div>

      {/* Type + person selector */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit mb-4">
          {(['teacher', 'student'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelectedIds([]); setSearch('') }}
              className={[
                'px-5 py-2 text-sm font-medium transition-colors',
                tab === t
                  ? 'bg-[#1E3A5F] text-white'
                  : 'text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {t === 'teacher' ? '先生' : '生徒'}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            {tab === 'teacher' ? '先生' : '生徒'}を選択（複数可）
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="text-xs text-[#1E3A5F] hover:underline">全選択</button>
            <span className="text-gray-300">|</span>
            <button onClick={clearAll} className="text-xs text-gray-500 hover:underline">クリア</button>
          </div>
        </div>

        <input
          type="text"
          placeholder="名前で絞り込み..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
        />

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {filteredList.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">「{search}」に一致する人が見つかりません</p>
          )}
          {filteredList.map((person) => {
            const isSelected = selectedIds.includes(person.id)
            const sub = tab === 'teacher'
              ? ((person as Teacher).subjects?.join('・') ?? '担当科目未設定')
              : getDisplayGrade((person as Student).grade)
            return (
              <label
                key={person.id}
                className={[
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors',
                  isSelected
                    ? 'border-[#1E3A5F] bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleId(person.id)}
                  className="text-[#1E3A5F] rounded"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{person.name}</p>
                  {sub && <p className="text-xs text-gray-500">{sub}</p>}
                </div>
              </label>
            )
          })}
        </div>

        {selectedIds.length > 0 && (
          <p className="mt-2 text-xs text-gray-500">{selectedIds.length}名選択中</p>
        )}
      </div>

      {/* Action */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          印刷プレビューが新しいタブで開きます。ブラウザの印刷機能でPDFとして保存できます。
        </p>
        <Button onClick={handleOpenPreviews} size="lg">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          {selectedIds.length > 0
            ? `${selectedIds.length}名の印刷プレビューを開く`
            : '全員の印刷プレビューを開く'}
        </Button>
      </div>
    </div>
  )
}
