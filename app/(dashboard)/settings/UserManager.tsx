'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createUser, updateUserRole, deleteUser } from './userActions'
import type { AppUser } from './userActions'

interface UserManagerProps {
  users: AppUser[]
  currentUserId: string
}

export function UserManager({ users, currentUserId }: UserManagerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'staff'>('staff')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    startTransition(async () => {
      const res = await createUser(email, password, role)
      if (res.error) { setError(res.error); return }
      setSuccess(`${email} を追加しました`)
      setEmail('')
      setPassword('')
      setRole('staff')
      setShowForm(false)
      router.refresh()
    })
  }

  function handleRoleChange(userId: string, newRole: 'admin' | 'staff') {
    startTransition(async () => {
      await updateUserRole(userId, newRole)
      router.refresh()
    })
  }

  function handleDelete(userId: string, userEmail: string) {
    if (!confirm(`${userEmail} を削除しますか？この操作は取り消せません。`)) return
    startTransition(async () => {
      const res = await deleteUser(userId)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}
      {success && (
        <div className="text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">{success}</div>
      )}

      {/* ユーザー一覧 */}
      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{u.email}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {u.last_sign_in_at
                  ? `最終ログイン: ${new Date(u.last_sign_in_at).toLocaleDateString('ja-JP')}`
                  : '未ログイン'}
              </p>
            </div>
            <select
              value={u.role}
              disabled={isPending}
              onChange={(e) => handleRoleChange(u.id, e.target.value as 'admin' | 'staff')}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-navy disabled:opacity-50"
            >
              <option value="admin">管理者</option>
              <option value="staff">スタッフ</option>
            </select>
            {u.id === currentUserId ? (
              <span className="text-[10px] text-gray-400 w-6 text-center">自分</span>
            ) : (
              <button
                onClick={() => handleDelete(u.id, u.email)}
                disabled={isPending}
                className="text-red-400 hover:text-red-600 disabled:opacity-30"
                title="削除"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 追加フォーム */}
      {showForm ? (
        <form onSubmit={handleCreate} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">新しいアカウントを追加</h3>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">メールアドレス</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">初期パスワード</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8文字以上"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">権限</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'staff')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            >
              <option value="staff">スタッフ（閲覧・基本操作）</option>
              <option value="admin">管理者（全操作）</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-navy text-white text-sm rounded-lg py-2 font-medium hover:bg-navy-light disabled:opacity-40 transition-colors"
            >
              {isPending ? '追加中...' : 'アカウントを作成'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError('') }}
              className="px-4 text-sm text-gray-500 border border-gray-300 rounded-lg py-2 hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => { setShowForm(true); setSuccess('') }}
          className="flex items-center gap-2 text-sm font-medium text-navy border border-navy rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          アカウントを追加
        </button>
      )}
    </div>
  )
}
