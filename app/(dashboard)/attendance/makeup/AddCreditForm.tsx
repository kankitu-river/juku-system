'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addMakeupCredit } from '@/app/(dashboard)/attendance/actions'
import { getDisplayGrade } from '@/lib/utils/grade'

interface Student {
  id: string
  name: string
  grade: string
}

interface AddCreditFormProps {
  students: Student[]
}

export function AddCreditForm({ students }: AddCreditFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [studentId, setStudentId] = useState('')
  const [amount, setAmount] = useState(1)
  const [expiresMonths, setExpiresMonths] = useState(3)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!studentId) return
    setError('')
    setSuccess('')
    startTransition(async () => {
      const res = await addMakeupCredit(studentId, expiresMonths, amount)
      if (res.error) {
        setError(res.error)
        return
      }
      const student = students.find((s) => s.id === studentId)
      setSuccess(`${student?.name}さんに振替クレジットを${amount}件追加しました`)
      setStudentId('')
      setAmount(1)
      router.refresh()
    })
  }

  return (
    <div className="mb-6">
      <button
        onClick={() => { setOpen((v) => !v); setError(''); setSuccess('') }}
        className="flex items-center gap-2 text-sm font-medium text-navy border border-navy rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        振替クレジットを手動で追加
      </button>

      {open && (
        <div className="mt-3 bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">振替クレジット 手動追加</h3>

          {error && (
            <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          {success && (
            <div className="mb-3 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">{success}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">生徒</label>
              <select
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
              >
                <option value="">選択してください</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{getDisplayGrade(s.grade)}）
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">追加件数</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">有効期限</label>
                <select
                  value={expiresMonths}
                  onChange={(e) => setExpiresMonths(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                >
                  <option value={1}>1ヶ月後</option>
                  <option value={2}>2ヶ月後</option>
                  <option value={3}>3ヶ月後</option>
                  <option value={6}>6ヶ月後</option>
                  <option value={12}>12ヶ月後</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={!studentId || isPending}
                className="flex-1 bg-navy text-white text-sm rounded-lg py-2 font-medium hover:bg-navy-light disabled:opacity-40 transition-colors"
              >
                {isPending ? '追加中...' : `${amount}件追加する`}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 text-sm text-gray-500 border border-gray-300 rounded-lg py-2 hover:bg-gray-50 transition-colors"
              >
                閉じる
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
