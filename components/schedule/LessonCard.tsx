import Link from 'next/link'
import type { Lesson } from '@/types'

interface LessonCardProps {
  lesson: Lesson
  compact?: boolean
}

export function LessonCard({ lesson, compact = false }: LessonCardProps) {
  const isGroup = lesson.type === 'group'
  const enrollmentStudents = (lesson.enrollments ?? [])
    .filter(e => e.student != null)
    .map(e => ({ ...e.student!, enrollmentSubject: e.subject ?? null }))
  const teacherName = lesson.teacher?.name
  const subject = lesson.subject

  const students = enrollmentStudents
  const displayStudents = students.slice(0, 2)
  const extraCount = students.length - 2
  const hasPerStudentSubjects = enrollmentStudents.some(s => s.enrollmentSubject)

  if (compact) {
    return (
      <Link
        href={`/schedule/${lesson.id}`}
        className={[
          'flex items-center gap-1 rounded px-1.5 py-1 text-xs leading-tight transition-opacity hover:opacity-80',
          isGroup
            ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-900 border border-purple-200 dark:border-purple-900'
            : 'bg-teal-100 dark:bg-teal-900/60 text-teal-900 border border-teal-200 dark:border-teal-900',
        ].join(' ')}
      >
        {lesson.lesson_kind === 'temporary' && (
          <span className="flex-shrink-0 text-[10px] font-bold px-1 rounded bg-orange-400 text-white">臨時</span>
        )}
        {teacherName && (
          <span className={[
            'flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
            isGroup ? 'bg-purple-700 text-white' : 'bg-teal-700 text-white',
          ].join(' ')}>
            {teacherName}
          </span>
        )}
        <span className="truncate text-[10px] opacity-80">
          {displayStudents.map((s) => s.enrollmentSubject ? `${s.name}(${s.enrollmentSubject})` : s.name).join('・')}
          {extraCount > 0 && ` +${extraCount}`}
        </span>
        <span className={[
          'flex-shrink-0 ml-auto text-[10px] font-bold px-1 rounded-full',
          isGroup ? 'bg-purple-200 text-purple-800 dark:text-purple-200' : 'bg-teal-200 text-teal-800 dark:text-teal-200',
        ].join(' ')}>
          {students.length}/{lesson.capacity}
        </span>
      </Link>
    )
  }

  return (
    <Link
      href={`/schedule/${lesson.id}`}
      className={[
        'block rounded-md px-2 py-2 text-xs transition-opacity hover:opacity-80 overflow-hidden h-[72px]',
        isGroup
          ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-900 border border-purple-200 dark:border-purple-900'
          : 'bg-teal-100 dark:bg-teal-900/60 text-teal-900 border border-teal-200 dark:border-teal-900',
      ].join(' ')}
    >
      {/* 先生 + 科目 + 定員 を1行に */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1 min-w-0 overflow-hidden">
          {lesson.lesson_kind === 'temporary' && (
            <span className="flex-shrink-0 text-[9px] font-bold px-1 rounded bg-orange-400 text-white">臨時</span>
          )}
          {lesson.is_ps1 && (
            <span className="flex-shrink-0 text-[9px] font-bold px-1 rounded bg-purple-500 text-white">1対1</span>
          )}
          {teacherName ? (
            <span className={[
              'flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              isGroup ? 'bg-purple-700 text-white' : 'bg-teal-700 text-white',
            ].join(' ')}>
              {teacherName}
            </span>
          ) : null}
          {subject && (!hasPerStudentSubjects || isGroup) && (
            <span className="truncate text-[10px] text-gray-400">{subject}</span>
          )}
        </div>
        <span className={[
          'flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
          isGroup ? 'bg-purple-200 text-purple-800 dark:text-purple-200' : 'bg-teal-200 text-teal-800 dark:text-teal-200',
        ].join(' ')}>
          {students.length}/{lesson.capacity}名
        </span>
      </div>

      {/* 生徒（生徒ごとの科目を表示） */}
      {displayStudents.length > 0 ? (
        <div className="leading-snug">
          {displayStudents.map((s, i) => (
            <p key={i} className="truncate text-[11px] text-gray-800 dark:text-gray-100">
              {s.name}{s.enrollmentSubject ? `（${s.enrollmentSubject}）` : ''}
            </p>
          ))}
          {extraCount > 0 && <p className="text-gray-400 text-[10px]">+{extraCount}名</p>}
        </div>
      ) : (
        <p className="text-[10px] opacity-40">生徒未登録</p>
      )}
    </Link>
  )
}
