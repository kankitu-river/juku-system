import Link from 'next/link'
import type { Lesson } from '@/types'

interface MakeupStudent {
  id: string
  name: string
}

interface LessonCardProps {
  lesson: Lesson
  compact?: boolean
  makeupStudents?: MakeupStudent[]  // その日にこのコマへ振替で入る生徒（アンバー表示）
}

export function LessonCard({ lesson, compact = false, makeupStudents = [] }: LessonCardProps) {
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
  const totalCount = students.length + makeupStudents.length

  if (compact) {
    return (
      <Link
        href={`/schedule/${lesson.id}`}
        className={[
          'flex items-center gap-1 rounded px-1.5 py-1 text-xs leading-tight transition-all duration-150 ease-out hover:shadow-md hover:-translate-y-px',
          isGroup
            ? 'bg-purple-50 dark:bg-purple-900/40 text-purple-900 border border-purple-200 dark:border-purple-800'
            : 'bg-teal-50 dark:bg-teal-900/40 text-teal-900 border border-teal-200 dark:border-teal-800',
        ].join(' ')}
      >
        {lesson.lesson_kind === 'temporary' && (
          <span className="flex-shrink-0 text-[10px] font-bold px-1 rounded bg-orange-400 text-white">臨時</span>
        )}
        {lesson.is_ps1 && (
          <span className="flex-shrink-0 text-[10px] font-bold px-1 rounded bg-purple-500 text-white">1対1</span>
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
        {makeupStudents.length > 0 && (
          <span className="flex-shrink-0 truncate text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-1 rounded">
            振替 {makeupStudents.map((m) => m.name).join('・')}
          </span>
        )}
        <span className={[
          'flex-shrink-0 ml-auto text-[10px] font-bold px-1 rounded-full',
          isGroup ? 'bg-purple-200 text-purple-800 dark:text-purple-200' : 'bg-teal-200 text-teal-800 dark:text-teal-200',
        ].join(' ')}>
          {totalCount}/{lesson.capacity}
        </span>
      </Link>
    )
  }

  return (
    <Link
      href={`/schedule/${lesson.id}`}
      className={[
        'block rounded-md px-2 py-2 text-xs transition-all duration-150 ease-out hover:shadow-md hover:-translate-y-px overflow-hidden',
        makeupStudents.length > 0 ? 'min-h-[72px]' : 'h-[72px]',
        isGroup
          ? 'bg-purple-50 dark:bg-purple-900/40 text-purple-900 border border-purple-200 dark:border-purple-800 border-l-2 border-l-purple-400'
          : 'bg-teal-50 dark:bg-teal-900/40 text-teal-900 border border-teal-200 dark:border-teal-800 border-l-2 border-l-teal-400',
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
          {totalCount}/{lesson.capacity}名
        </span>
      </div>

      {/* 生徒（生徒ごとの科目を表示） */}
      {displayStudents.length > 0 || makeupStudents.length > 0 ? (
        <div className="leading-snug">
          {displayStudents.map((s, i) => (
            <p key={i} className="truncate text-[11px] text-gray-800 dark:text-gray-100">
              {s.name}{s.enrollmentSubject ? `（${s.enrollmentSubject}）` : ''}
            </p>
          ))}
          {extraCount > 0 && <p className="text-gray-400 text-[10px]">+{extraCount}名</p>}
          {makeupStudents.map((m) => (
            <p key={m.id} className="truncate text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-900/40 rounded px-1 -mx-1">
              {m.name}<span className="text-[9px] font-bold ml-1">振替</span>
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[10px] opacity-40">生徒未登録</p>
      )}
    </Link>
  )
}
