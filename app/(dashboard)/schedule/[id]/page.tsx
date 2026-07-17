import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { LessonForm } from '@/components/schedule/LessonForm'
import { updateLesson, deleteLesson, getLessonImpact } from '../actions'
import type { Lesson, Teacher, Booth, Student, LessonEnrollment } from '@/types'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { getSlotLabel } from '@/lib/constants/timeSlots'
import Link from 'next/link'
import { UndoButton } from '@/app/(dashboard)/history/UndoButton'
import { WaitlistSection } from './WaitlistSection'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LessonDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: lesson }, { data: teachers }, { data: booths }, { data: students }, { data: enrollments }, { data: auditLogs }, { data: closures }, { data: events }, { data: waitlist }] =
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
      supabase
        .from('audit_logs')
        .select('id, action, summary, created_at')
        .eq('table_name', 'lessons')
        .eq('record_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('school_closures').select('date'),
      supabase.from('events').select('title, start_at, end_at')
        .gte('end_at', new Date().toISOString())
        .order('start_at'),
      supabase
        .from('waitlist')
        .select('id, position, notes, created_at, student:students(id, name, grade)')
        .eq('lesson_id', id)
        .eq('status', 'waiting')
        .order('position', { ascending: true }),
    ])

  if (!lesson) notFound()

  const typedLesson = lesson as Lesson
  const typedEnrollments = (enrollments as LessonEnrollment[]) ?? []
  type AuditLogRow = { id: string; action: string; summary: string | null; created_at: string }
  const typedAuditLogs = (auditLogs ?? []) as AuditLogRow[]
  const enrolledStudentIds = typedEnrollments.map((e) => e.student_id)
  const enrolledStudentSubjects = Object.fromEntries(
    typedEnrollments.map((e) => [e.student_id, (e as { student_id: string; subject?: string }).subject ?? ''])
  )
  type WaitlistEntry = { id: string; position: number; notes: string | null; created_at: string; student: { id: string; name: string; grade: string } | null }
  const typedWaitlist = (waitlist ?? []) as unknown as WaitlistEntry[]
  const hasCapacity = enrolledStudentIds.length < (typedLesson.capacity as number)
  const waitlistStudentIds = new Set(typedWaitlist.map((w) => w.student?.id).filter(Boolean))
  const waitlistAvailableStudents = ((students as { id: string; name: string; grade: string }[]) ?? [])
    .filter((s) => !enrolledStudentIds.includes(s.id) && !waitlistStudentIds.has(s.id))

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
            closureDates={(closures ?? []).map((c) => c.date)}
            upcomingEvents={(events ?? []) as { title: string; start_at: string; end_at: string }[]}
            onSave={updateLesson.bind(null, id)}
            onDelete={deleteLesson.bind(null, id)}
            onGetImpact={getLessonImpact.bind(null, id)}
          />
        </div>

        {/* 右カラム */}
        <div className="space-y-4">

        {/* コマ情報サマリー */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
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

        {/* 変更履歴 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 text-sm">変更履歴</h3>
          {typedAuditLogs.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">まだ履歴がありません</p>
          ) : (
            <div className="space-y-2">
              {typedAuditLogs.map((log) => {
                const date = new Date(log.created_at)
                const dateStr = date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                const actionLabel: Record<string, string> = { create: '作成', update: '更新', delete: '削除', undo: '取消' }
                const actionColor: Record<string, string> = {
                  create: 'text-green-600 dark:text-green-400',
                  update: 'text-blue-600 dark:text-blue-400',
                  delete: 'text-red-600 dark:text-red-400',
                  undo:   'text-amber-600 dark:text-amber-400',
                }
                return (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className={`text-xs font-medium shrink-0 ${actionColor[log.action] ?? 'text-gray-500'}`}>
                      {actionLabel[log.action] ?? log.action}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{log.summary ?? '—'}</p>
                      <p className="text-[10px] text-gray-400">{dateStr}</p>
                    </div>
                    <UndoButton logId={log.id} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* キャンセル待ち */}
        <WaitlistSection
          lessonId={id}
          entries={typedWaitlist}
          availableStudents={waitlistAvailableStudents}
          hasCapacity={hasCapacity}
        />

        </div>
      </div>
    </div>
  )
}
