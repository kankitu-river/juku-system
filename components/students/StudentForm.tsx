'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Student, Teacher } from '@/types'
import { Button } from '@/components/ui/Button'
import type { StudentFormData } from '@/app/(dashboard)/students/actions'

const SUBJECT_OPTIONS = ['数学', '英語', '国語', '理科', '社会', '物理', '化学', '生物', '日本史', '世界史', '地理']
const GRADE_OPTIONS = ['小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3']

const DAY_LABELS: Record<number, string> = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' }

export interface LessonOption {
  id: string
  day_of_week: number
  slot_index: number
  subject: string
  type: string
  term_type: string
  teacher: { id: string; name: string } | null
}

interface StudentFormProps {
  student?: Student
  teachers?: Teacher[]
  lessons?: LessonOption[]
  enrolledLessonIds?: string[]
  onSave: (data: StudentFormData) => Promise<{ error?: string }>
  onDelete?: () => Promise<{ error?: string }>
}

export function StudentForm({ student, teachers = [], lessons = [], enrolledLessonIds = [], onSave, onDelete }: StudentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const [error, setError] = useState<string>()

  const [form, setForm] = useState<StudentFormData>({
    name: student?.name ?? '',
    surname: student?.surname ?? '',
    grade: student?.grade ?? '',
    subjects: student?.subjects ?? [],
    preferred_teacher_ids: student?.preferred_teacher_ids ?? [],
    ng_teacher_ids: student?.ng_teacher_ids ?? [],
    fixed_slots: student?.fixed_slots ?? [],
    lesson_ids: enrolledLessonIds,
  })

  function toggleLesson(lessonId: string) {
    setForm(prev => ({
      ...prev,
      lesson_ids: prev.lesson_ids.includes(lessonId)
        ? prev.lesson_ids.filter(id => id !== lessonId)
        : [...prev.lesson_ids, lessonId],
    }))
  }

  function toggleSubject(subject: string) {
    setForm((prev) => ({
      ...prev,
      subjects: prev.subjects.includes(subject)
        ? prev.subjects.filter((s) => s !== subject)
        : [...prev.subjects, subject],
    }))
  }

  function toggleTeacher(field: 'preferred_teacher_ids' | 'ng_teacher_ids', teacherId: string) {
    const other = field === 'preferred_teacher_ids' ? 'ng_teacher_ids' : 'preferred_teacher_ids'
    setForm((prev) => {
      const isActive = prev[field].includes(teacherId)
      return {
        ...prev,
        [other]: prev[other].filter((id) => id !== teacherId),
        [field]: isActive ? prev[field].filter((id) => id !== teacherId) : [...prev[field], teacherId],
      }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(undefined)
    startTransition(async () => {
      const result = await onSave(form)
      if (result.error) {
        setError(result.error)
      } else {
        router.push('/students')
        router.refresh()
      }
    })
  }

  function handleDelete() {
    if (!onDelete) return
    if (!confirm('この生徒を削除しますか？')) return
    startDeleting(async () => {
      const result = await onDelete()
      if (result.error) {
        setError(result.error)
      } else {
        router.push('/students')
        router.refresh()
      }
    })
  }

  // コマを曜日ごとにグループ化
  const lessonsByDay = lessons.reduce<Record<number, LessonOption[]>>((acc, l) => {
    if (!acc[l.day_of_week]) acc[l.day_of_week] = []
    acc[l.day_of_week].push(l)
    return acc
  }, {})

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
            placeholder="例：田中 太郎"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            学年 <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={form.grade}
            onChange={(e) => setForm({ ...form, grade: e.target.value })}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="">— 選択 —</option>
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 受講コマ */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">受講コマ</label>
          {student?.id && (
            <Link
              href={`/schedule/new?student=${student.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-navy dark:text-blue-300 border border-navy rounded-lg px-2.5 py-1 hover:bg-blue-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新しいコマを作成
            </Link>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-3">スケジュールに登録されているコマから選択します。選択したコマがスケジュール画面に反映されます。</p>

        {lessons.length === 0 ? (
          <div className="border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center text-sm text-gray-400">
            コマがまだ登録されていません。先に「スケジュール」画面でコマを作成してください。
          </div>
        ) : (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
            {[1, 2, 3, 4, 5, 6].map(day => {
              const dayLessons = lessonsByDay[day]
              if (!dayLessons) return null
              return (
                <div key={day} className="px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{DAY_LABELS[day]}曜日</p>
                  <div className="space-y-1.5">
                    {dayLessons.sort((a, b) => a.slot_index - b.slot_index).map(lesson => {
                      const isSelected = form.lesson_ids.includes(lesson.id)
                      return (
                        <label
                          key={lesson.id}
                          className={[
                            'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                            isSelected ? 'bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900' : 'bg-gray-50 dark:bg-gray-900/50 border border-transparent hover:border-gray-200',
                          ].join(' ')}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleLesson(lesson.id)}
                            className="rounded text-navy dark:text-blue-300"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">第{lesson.slot_index}コマ</span>
                            <span className="mx-1.5 text-gray-300">|</span>
                            <span className="text-xs text-gray-700 dark:text-gray-300">{lesson.subject}</span>
                            {lesson.teacher && (
                              <span className="ml-1.5 text-xs text-gray-400">{lesson.teacher.name}</span>
                            )}
                          </div>
                          <span className={[
                            'text-[10px] px-1.5 py-0.5 rounded font-medium',
                            lesson.type === 'group' ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300' : 'bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300',
                          ].join(' ')}>
                            {lesson.type === 'group' ? '集団' : '個別'}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {form.lesson_ids.length > 0 && (
          <p className="mt-2 text-xs text-teal-600 dark:text-teal-300 font-medium">{form.lesson_ids.length}コマ選択中</p>
        )}
      </div>

      {/* 受講科目 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">受講科目</label>
        <div className="flex flex-wrap gap-2">
          {SUBJECT_OPTIONS.map((subject) => (
            <button
              key={subject}
              type="button"
              onClick={() => toggleSubject(subject)}
              className={[
                'px-3 py-1.5 rounded-full text-sm border transition-colors',
                form.subjects.includes(subject)
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-navy',
              ].join(' ')}
            >
              {subject}
            </button>
          ))}
        </div>
      </div>

      {/* 先生との相性 */}
      {teachers.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">先生との相性設定</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">先生名をクリックして「任せたい」または「NG」を設定します</p>

          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {teachers.map((teacher) => {
              const isPreferred = form.preferred_teacher_ids.includes(teacher.id)
              const isNg = form.ng_teacher_ids.includes(teacher.id)
              return (
                <div key={teacher.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{teacher.name}</p>
                    {teacher.subjects?.length > 0 && (
                      <p className="text-xs text-gray-400">{teacher.subjects.join('・')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleTeacher('preferred_teacher_ids', teacher.id)}
                      className={[
                        'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                        isPreferred
                          ? 'bg-amber-400 text-white border-amber-400'
                          : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-amber-400 hover:text-amber-600',
                      ].join(' ')}
                    >
                      ⭐ 任せたい
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleTeacher('ng_teacher_ids', teacher.id)}
                      className={[
                        'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                        isNg
                          ? 'bg-red-500 text-white border-red-500'
                          : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-red-400 hover:text-red-600',
                      ].join(' ')}
                    >
                      ❌ NG
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-3">
          <Button type="submit" loading={isPending}>
            {student ? '更新する' : '登録する'}
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
