'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Student, LessonEnrollment } from '@/types'
import { enrollStudent, unenrollStudent } from '@/app/(dashboard)/schedule/actions'
import { getDisplayGrade } from '@/lib/utils/grade'

interface EnrollmentManagerProps {
  lessonId: string
  capacity: number
  enrollments: LessonEnrollment[]
  allStudents: Student[]
}

export function EnrollmentManager({
  lessonId,
  capacity,
  enrollments,
  allStudents,
}: EnrollmentManagerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')

  const enrolledIds = new Set(enrollments.map((e) => e.student_id))
  const enrolledStudents = enrollments.map((e) => e.student).filter(Boolean) as Student[]

  const candidates = allStudents.filter(
    (s) => !enrolledIds.has(s.id) && s.name.includes(search)
  )

  const isFull = enrolledStudents.length >= capacity

  function handleEnroll(studentId: string) {
    startTransition(async () => {
      await enrollStudent(lessonId, studentId)
      router.refresh()
    })
  }

  function handleUnenroll(studentId: string) {
    if (!confirm('この生徒をコマから外しますか？')) return
    startTransition(async () => {
      await unenrollStudent(lessonId, studentId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* 登録済み生徒 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">登録済み生徒</p>
          <span className={[
            'text-xs font-medium px-2 py-0.5 rounded-full',
            isFull ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
          ].join(' ')}>
            {enrolledStudents.length} / {capacity}名
          </span>
        </div>

        {enrolledStudents.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">まだ生徒が登録されていません</p>
        ) : (
          <ul className="space-y-1">
            {enrolledStudents.map((student) => (
              <li
                key={student.id}
                className="flex items-center justify-between bg-teal-50 border border-teal-100 rounded-lg px-3 py-2"
              >
                <div>
                  <span className="text-sm font-medium text-gray-800">{student.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{getDisplayGrade(student.grade)}</span>
                </div>
                <button
                  onClick={() => handleUnenroll(student.id)}
                  disabled={isPending}
                  className="text-red-400 hover:text-red-600 text-xs transition-colors"
                >
                  外す
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 生徒追加 */}
      {!isFull && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">生徒を追加</p>
          <input
            type="text"
            placeholder="名前で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-navy"
          />
          {candidates.length === 0 ? (
            <p className="text-xs text-gray-400">
              {allStudents.length === 0 ? '生徒が登録されていません' : '該当する生徒がいません'}
            </p>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {candidates.map((student) => (
                <li key={student.id}>
                  <button
                    onClick={() => handleEnroll(student.id)}
                    disabled={isPending}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 hover:border-navy transition-colors text-left"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-800">{student.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{getDisplayGrade(student.grade)}</span>
                    </div>
                    <span className="text-xs text-navy font-medium">+ 追加</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isFull && (
        <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">
          定員に達しています（{capacity}名）
        </p>
      )}
    </div>
  )
}
