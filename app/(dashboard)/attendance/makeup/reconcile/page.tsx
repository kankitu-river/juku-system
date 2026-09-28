import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import type { LessonCandidate, TermPeriodRecord } from '@/lib/utils/makeupSuggestion'
import { matchCandidates } from '@/lib/utils/makeupReconcile'
import { ReconcileClient, type ReconcileRow } from './ReconcileClient'

export default async function ReconcilePage() {
  const supabase = await createClient()

  const [{ data: requests, error }, { data: lessons }] = await Promise.all([
    supabase
      .from('makeup_requests')
      .select('id, subject, desired_raw, scheduled_date, student:students(id, name, grade, subjects, preferred_teacher_ids, ng_teacher_ids)')
      .eq('status', 'scheduled')
      .is('assigned_lesson_id', null)
      .not('scheduled_date', 'is', null)
      .order('scheduled_date', { ascending: true }),
    supabase
      .from('lessons')
      .select('*, teacher:teachers(id, name, subjects), booth:booths(id, name), enrollments:lesson_enrollments(id)')
      .order('day_of_week')
      .order('slot_index'),
  ])

  const { data: termPeriods } = await supabase
    .from('term_periods')
    .select('type, start_date, end_date')

  type ReqRow = {
    id: string
    subject: string
    desired_raw: string
    scheduled_date: string
    student: { id: string; name: string; grade: string; subjects: string[]; preferred_teacher_ids: string[]; ng_teacher_ids: string[] } | null
  }

  const lessonList = (lessons ?? []) as unknown as LessonCandidate[]
  const terms = (termPeriods ?? []) as TermPeriodRecord[]

  const rows: ReconcileRow[] = ((requests ?? []) as unknown as ReqRow[])
    .filter((r) => r.student)
    .map((r) => {
      const candidates = matchCandidates(
        r.scheduled_date,
        r.desired_raw,
        {
          id: r.student!.id,
          subjects: r.student!.subjects ?? [],
          ng_teacher_ids: r.student!.ng_teacher_ids ?? [],
          preferred_teacher_ids: r.student!.preferred_teacher_ids ?? [],
        },
        lessonList,
        terms
      )
      const nonFull = candidates.filter((c) => !c.isFull)
      const autoLessonId = nonFull.length === 1 ? nonFull[0].lessonId : null
      return {
        id: r.id,
        studentName: r.student!.name,
        grade: r.student!.grade,
        subject: r.subject,
        date: r.scheduled_date,
        desiredRaw: r.desired_raw,
        candidates,
        autoLessonId,
      }
    })

  return (
    <div>
      <Header
        title="振替の照合"
        subtitle="決定している振替を、スケジュールのコマに突き合わせて割り当て"
        actions={
          <Link
            href="/attendance/makeup"
            className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            振替管理へ
          </Link>
        }
      />
      {error ? (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm rounded-xl px-4 py-3">
          読み込みに失敗しました（{error.message}）。マイグレーション 030/031 を実行してください。
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-8 text-center text-gray-400 text-sm">
          コマ未配置の「決定」振替はありません。
        </div>
      ) : (
        <ReconcileClient rows={rows} />
      )}
    </div>
  )
}
