import Link from 'next/link'
import type { Lesson } from '@/types'

interface MakeupStudent {
  id: string
  name: string
  kind?: 'makeup' | 'temporary'  // makeup=振替（既定）, temporary=臨時
  subject?: string
}

interface LessonCardProps {
  lesson: Lesson
  compact?: boolean
  makeupStudents?: MakeupStudent[]  // その日にこのコマへ振替/臨時で入る生徒
  absentStudentIds?: string[]  // その日だけ外れる（欠席）通常メンバーの生徒ID
}

export function LessonCard({ lesson, compact = false, makeupStudents = [], absentStudentIds = [] }: LessonCardProps) {
  const isGroup = lesson.type === 'group'
  const absentSet = new Set(absentStudentIds)
  const enrollmentStudents = (lesson.enrollments ?? [])
    .filter(e => e.student != null)
    .map(e => ({ ...e.student!, enrollmentSubject: e.subject ?? null, isAbsent: absentSet.has(e.student!.id) }))
  const teacherName = lesson.teacher?.name
  const subject = lesson.subject

  const students = enrollmentStudents
  const displayStudents = students.slice(0, 2)
  const extraCount = students.length - 2
  const hasPerStudentSubjects = enrollmentStudents.some(s => s.enrollmentSubject)
  const presentCount = students.filter(s => !s.isAbsent).length
  const totalCount = presentCount + makeupStudents.length

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
        {isGroup && subject && (
          <span className="flex-shrink-0 text-[10px] font-semibold text-purple-700 dark:text-purple-300">{subject}</span>
        )}
        <span className="truncate text-[10px] opacity-80">
          {displayStudents.map((s, i) => (
            <span key={i} className={s.isAbsent ? 'line-through text-gray-400' : ''}>
              {i > 0 ? '・' : ''}{s.enrollmentSubject ? `${s.name}(${s.enrollmentSubject})` : s.name}
            </span>
          ))}
          {extraCount > 0 && ` +${extraCount}`}
        </span>
        {makeupStudents.filter((m) => m.kind !== 'temporary').length > 0 && (
          <span className="flex-shrink-0 truncate text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-1 rounded">
            振替 {makeupStudents.filter((m) => m.kind !== 'temporary').map((m) => m.name).join('・')}
          </span>
        )}
        {makeupStudents.filter((m) => m.kind === 'temporary').length > 0 && (
          <span className="flex-shrink-0 truncate text-[10px] font-bold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/60 px-1 rounded">
            臨時 {makeupStudents.filter((m) => m.kind === 'temporary').map((m) => m.name).join('・')}
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
            <span className={isGroup
              ? 'flex-shrink-0 truncate text-[10px] font-semibold text-purple-700 dark:text-purple-300'
              : 'truncate text-[10px] text-gray-400'}>{subject}</span>
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
            <p key={i} className={s.isAbsent
              ? 'truncate text-[11px] text-gray-400 line-through'
              : 'truncate text-[11px] text-gray-800 dark:text-gray-100'}>
              {s.name}{s.enrollmentSubject ? `（${s.enrollmentSubject}）` : ''}{s.isAbsent ? ' 休' : ''}
            </p>
          ))}
          {extraCount > 0 && <p className="text-gray-400 text-[10px]">+{extraCount}名</p>}
          {makeupStudents.map((m) => (
            m.kind === 'temporary' ? (
              <p key={m.id} className="truncate text-[11px] font-medium text-orange-700 dark:text-orange-300 bg-orange-100/70 dark:bg-orange-900/40 rounded px-1 -mx-1">
                {m.name}{m.subject ? `（${m.subject}）` : ''}<span className="text-[9px] font-bold ml-1">臨時</span>
              </p>
            ) : (
              <p key={m.id} className="truncate text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-900/40 rounded px-1 -mx-1">
                {m.name}<span className="text-[9px] font-bold ml-1">振替</span>
              </p>
            )
          ))}
        </div>
      ) : (
        <p className="text-[10px] opacity-40">生徒未登録</p>
      )}
    </Link>
  )
}
