import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { LessonForm } from '@/components/schedule/LessonForm'
import { updateLesson, deleteLesson } from '../actions'
import type { Lesson, Teacher, Booth, Student, LessonEnrollment } from '@/types'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { getSlotLabel } from '@/lib/constants/timeSlots'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LessonDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: lesson }, { data: teachers }, { data: booths }, { data: students }, { data: enrollments }] =
    await Promise.all([
      supabase
        .from('lessons')
        .select('*, teacher:teachers(id, name), booth:booths(id, name)')
        .eq('id', id)
        .single(),
      supabase.from('teachers').select('*').order('name'),
      supabase.from('booths').select('*').eq('is_active', true).order('name'),
      supabase.from('students').select('*').order('name'),
      supabase
        .from('lesson_enrollments')
        .select('*, student:students(id, name, grade)')
        .eq('lesson_id', id),
    ])

  if (!lesson) notFound()

  const typedLesson = lesson as Lesson
  const typedEnrollments = (enrollments as LessonEnrollment[]) ?? []
  const enrolledStudentIds = typedEnrollments.map((e) => e.student_id)
  const enrolledStudentSubjects = Object.fromEntries(
    typedEnrollments.map((e) => [e.student_id, (e as { student_id: string; subject?: string }).subject ?? ''])
  )

  return (
    <div>
      <Header
        title={typedLesson.subject || 'コマ詳細'}
        subtitle="コマの詳細・編集"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={typedLesson.type === 'group' ? 'group' : 'individual'}>
              {typedLesson.type === 'group' ? '集団授業' : '個別指導'}
            </Badge>
            <Badge variant={typedLesson.term_type === 'intensive' ? 'intensive' : 'regular'}>
              {typedLesson.term_type === 'intensive' ? '講習期間' : '通常期間'}
            </Badge>
            <Link
              href={`/schedule/new?copy=${id}`}
              className="ml-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-300 transition-colors"
            >
              コピーして新規作成
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 編集フォーム */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <LessonForm
            lesson={typedLesson}
            teachers={(teachers as Teacher[]) ?? []}
            booths={(booths as Booth[]) ?? []}
            students={(students as Student[]) ?? []}
            enrolledStudentIds={enrolledStudentIds}
            enrolledStudentSubjects={enrolledStudentSubjects}
            onSave={updateLesson.bind(null, id)}
            onDelete={deleteLesson.bind(null, id)}
          />
        </div>

        {/* コマ情報サマリー */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 h-fit">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 text-sm">コマ情報</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">時間帯</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-100">
                {getSlotLabel(typedLesson.slot_index, typedLesson.day_of_week, typedLesson.term_type)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">科目</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-100">{typedLesson.subject}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">担当講師</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-100">
                {typedLesson.teacher?.name ?? '未割り当て'}
              </dd>
            </div>
            {typedLesson.type === 'individual' && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">ブース</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-100">
                  {typedLesson.booth?.name ?? '未割り当て'}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">定員</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-100">{typedLesson.capacity}名</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">受講生徒数</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-100">{enrolledStudentIds.length}名</dd>
            </div>
          </dl>

          {enrolledStudentIds.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">受講生徒</p>
              <div className="space-y-1">
                {typedEnrollments.map((e) => (
                  <div key={e.id} className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />
                    <span>{e.student?.name ?? '—'}</span>
                    {e.subject && (
                      <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">{e.subject}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
