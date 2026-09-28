import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { MakeupManager } from './MakeupManager'
import { MakeupAssignmentList, type MakeupAssignment } from './MakeupAssignmentList'
import { getJstTodayStr } from '@/lib/utils/datetime'
import Link from 'next/link'

export default async function MakeupPage() {
  const supabase = await createClient()
  const todayStr = getJstTodayStr()

  const [{ data: ledgerItems }, { data: lessons }, { data: shifts }, { data: assignments }] = await Promise.all([
    supabase
      .from('makeup_requests')
      .select('id, subject, status, scheduled_date, assigned_lesson_id, student:students(id, name, grade, subjects, preferred_teacher_ids, ng_teacher_ids)')
      .in('status', ['pending', 'scheduled'])
      .order('status', { ascending: true }),
    supabase
      .from('lessons')
      .select('*, teacher:teachers(id, name, subjects, subject_grades), booth:booths(id, name), enrollments:lesson_enrollments(id)')
      .order('day_of_week')
      .order('slot_index'),
    supabase
      .from('shifts')
      .select('*')
      .gte('date', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
      .lte('date', new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]),
    supabase
      .from('makeup_assignments')
      .select('id, assigned_date, created_at, student:students(id, name, grade), lesson:lessons(id, slot_index, day_of_week, term_type, type, subject, teacher:teachers(id, name))')
      .order('assigned_date', { ascending: false })
      .limit(200),
  ])

  const { data: termPeriods } = await supabase
    .from('term_periods')
    .select('type, start_date, end_date')

  // 名簿に紐づいている未消化のみ割り当て対象（未紐付けは台帳ページで解消）
  type LedgerRow = {
    id: string
    subject: string
    status: 'pending' | 'scheduled'
    scheduled_date: string | null
    assigned_lesson_id: string | null
    student: { id: string; name: string; grade: string; subjects: string[]; preferred_teacher_ids: string[]; ng_teacher_ids: string[] } | null
  }
  const items = ((ledgerItems ?? []) as unknown as LedgerRow[])
    .filter((r) => r.student)
    .map((r) => ({ id: r.id, subject: r.subject, status: r.status, scheduledDate: r.scheduled_date, isPlaced: !!r.assigned_lesson_id, student: r.student }))

  return (
    <div>
      <Header
        title="振替管理"
        subtitle="台帳の未消化を選んで、相性の良いコマに割り当て"
        actions={
          <Link
            href="/attendance/makeup/ledger"
            className="px-3 py-1.5 text-sm font-medium text-white bg-navy rounded-lg hover:bg-navy-light transition-colors"
          >
            振替台帳を見る
          </Link>
        }
      />
      <MakeupManager
        items={items}
        lessons={lessons ?? []}
        shifts={shifts ?? []}
        termPeriods={(termPeriods ?? []) as { type: 'regular' | 'intensive'; start_date: string; end_date: string }[]}
        recentAssignments={(assignments ?? []) as unknown as MakeupAssignment[]}
      />
      <MakeupAssignmentList
        assignments={(assignments ?? []) as unknown as MakeupAssignment[]}
        todayStr={todayStr}
      />
    </div>
  )
}
