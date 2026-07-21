'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Teacher, SubjectGrade } from '@/types'
import { Button } from '@/components/ui/Button'
import type { TeacherFormData } from '@/app/(dashboard)/teachers/actions'

const SUBJECT_OPTIONS = ['数学', '英語', '国語', '理科', '社会', '物理', '化学', '生物', '日本史', '世界史', '地理']
const GRADE_OPTIONS = ['小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3']

interface TeacherFormProps {
  teacher?: Teacher
  onSave: (data: TeacherFormData) => Promise<{ error?: string }>
  onDelete?: () => Promise<{ error?: string }>
}

export function TeacherForm({ teacher, onSave, onDelete }: TeacherFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const [error, setError] = useState<string>()

  const [form, setForm] = useState<TeacherFormData>({
    name: teacher?.name ?? '',
    email: teacher?.email ?? '',
    role: teacher?.role ?? 'staff',
    subject_grades: teacher?.subject_grades ?? [],
  })

  function isSubjectSelected(subject: string) {
    return form.subject_grades.some((sg) => sg.subject === subject)
  }

  function getGradesForSubject(subject: string): string[] {
    return form.subject_grades.find((sg) => sg.subject === subject)?.grades ?? []
  }

  function toggleSubject(subject: string) {
    setForm((prev) => {
      const exists = prev.subject_grades.some((sg) => sg.subject === subject)
      return {
        ...prev,
        subject_grades: exists
          ? prev.subject_grades.filter((sg) => sg.subject !== subject)
          : [...prev.subject_grades, { subject, grades: [] }],
      }
    })
  }

  function toggleGrade(subject: string, grade: string) {
    setForm((prev) => ({
      ...prev,
      subject_grades: prev.subject_grades.map((sg) =>
        sg.subject !== subject ? sg : {
          ...sg,
          grades: sg.grades.includes(grade)
            ? sg.grades.filter((g) => g !== grade)
            : [...sg.grades, grade],
        }
      ),
    }))
  }

  function setGradeRange(subject: string, maxGrade: string) {
    const maxIdx = GRADE_OPTIONS.indexOf(maxGrade)
    const grades = GRADE_OPTIONS.slice(0, maxIdx + 1)
    setForm((prev) => ({
      ...prev,
      subject_grades: prev.subject_grades.map((sg) =>
        sg.subject !== subject ? sg : { ...sg, grades }
      ),
    }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(undefined)
    startTransition(async () => {
      const result = await onSave(form)
      if (result.error) {
        setError(result.error)
      } else {
        router.push('/teachers')
        router.refresh()
      }
    })
  }

  function handleDelete() {
    if (!onDelete) return
    if (!confirm('この先生を削除しますか？')) return
    startDeleting(async () => {
      const result = await onDelete()
      if (result.error) {
        setError(result.error)
      } else {
        router.push('/teachers')
        router.refresh()
      }
    })
  }

  const selectedSubjects = form.subject_grades

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            氏名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="例：山田 太郎"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            メールアドレス
            <span className="ml-1.5 text-xs text-gray-400 font-normal">任意・シフトメール送信に使用</span>
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="teacher@juku.com"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">権限</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'staff' })}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="staff">スタッフ</option>
            <option value="admin">管理者</option>
          </select>
        </div>
      </div>

      {/* 担当科目と対応学年 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">担当科目と対応学年</label>
        <p className="text-xs text-gray-400 mb-3">科目を選択し、その科目で担当できる学年を選んでください</p>

        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
          {SUBJECT_OPTIONS.map((subject) => {
            const selected = isSubjectSelected(subject)
            const grades = getGradesForSubject(subject)
            return (
              <div key={subject} className={['px-4 py-3 transition-colors', selected ? 'bg-blue-50 dark:bg-blue-950/40' : 'bg-white dark:bg-gray-800'].join(' ')}>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleSubject(subject)}
                    className={[
                      'shrink-0 w-20 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                      selected
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-navy',
                    ].join(' ')}
                  >
                    {subject}
                  </button>

                  {selected && (
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {GRADE_OPTIONS.map((grade) => (
                        <button
                          key={grade}
                          type="button"
                          onClick={() => toggleGrade(subject, grade)}
                          className={[
                            'px-2 py-1 rounded text-xs font-medium border transition-colors',
                            grades.includes(grade)
                              ? 'bg-amber-brand text-white border-amber-brand'
                              : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:border-amber-brand hover:text-amber-brand',
                          ].join(' ')}
                        >
                          {grade}
                        </button>
                      ))}
                    </div>
                  )}

                  {!selected && (
                    <span className="text-xs text-gray-300">— 担当しない</span>
                  )}
                </div>

                {selected && grades.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">〜まで一括：</span>
                    <select
                      value=""
                      onChange={(e) => e.target.value && setGradeRange(subject, e.target.value)}
                      className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-600 dark:text-gray-300"
                    >
                      <option value="">学年を選ぶ</option>
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g} value={g}>{g}まで</option>
                      ))}
                    </select>
                  </div>
                )}

                {selected && grades.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-300">学年が選択されていません</p>
                )}
              </div>
            )
          })}
        </div>

        {selectedSubjects.length > 0 && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">登録内容まとめ</p>
            <div className="flex flex-wrap gap-2">
              {selectedSubjects.map((sg) => (
                <span key={sg.subject} className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 text-gray-700 dark:text-gray-300">
                  <span className="font-medium text-navy dark:text-blue-300">{sg.subject}</span>
                  {sg.grades.length > 0
                    ? `：${sg.grades[0]}〜${sg.grades[sg.grades.length - 1]}`
                    : <span className="text-amber-700 dark:text-amber-400 ml-1">（学年未設定）</span>
                  }
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-3">
          <Button type="submit" loading={isPending}>
            {teacher ? '更新する' : '登録する'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            キャンセル
          </Button>
        </div>
        {onDelete && (
          <Button type="button" variant="danger" loading={isDeleting} onClick={handleDelete}>
            削除
          </Button>
        )}
      </div>
    </form>
  )
}
