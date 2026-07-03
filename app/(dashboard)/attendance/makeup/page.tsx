import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { MakeupManager } from './MakeupManager'
import { AddCreditForm } from './AddCreditForm'
import { MakeupAssignmentList, type MakeupAssignment } from './MakeupAssignmentList'
import { getJstTodayStr } from '@/lib/utils/datetime'

export default async function MakeupPage() {
  const supabase = await createClient()
  const todayStr = getJstTodayStr()

  const [{ data: credits }, { data: lessons }, { data: teachers }, { data: shifts }, { data: students }, { data: assignments }] = await Promise.all([
    supabase
      .from('makeup_credits')
      .select('*, student:students(id, name, grade, subjects, preferred_teacher_ids, ng_teacher_ids)')
      .gt('total_credits', 0)
      .order('expires_at', { ascending: true, nullsFirst: false }),
    supabase
      .from('lessons')
      .select('*, teacher:teachers(id, name, subjects, subject_grades), booth:booths(id, name), enrollments:lesson_enrollments(id)')
      .order('day_of_week')
      .order('slot_index'),
    supabase
      .from('teachers')
      .select('id, name, subjects, grade_levels, email, role, created_at')
      .order('name'),
    supabase
      .from('shifts')
      .select('*')
      .gte('date', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
      .lte('date', new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]),
    supabase
      .from('students')
      .select('id, name, grade')
      .order('grade')
      .order('name'),
    supabase
      .from('makeup_assignments')
      .select('id, assigned_date, created_at, student:students(id, name, grade), lesson:lessons(id, slot_index, day_of_week, term_type, type, subject, teacher:teachers(id, name))')
      .order('assigned_date', { ascending: false })
      .limit(200),
  ])

  const { data: termPeriods } = await supabase
    .from('term_periods')
    .select('type, start_date, end_date')

  const activeCredits = (credits ?? []).filter(
    (c) => c.total_credits - c.used_credits > 0
  )

  return (
    <div>
      <Header
        title="振替管理"
        subtitle="振替クレジットの残数確認・コマ割り当て"
      />
      <AddCreditForm students={students ?? []} />
      <MakeupManager
        credits={activeCredits}
        lessons={lessons ?? []}
        shifts={shifts ?? []}
        termPeriods={(termPeriods ?? []) as { type: 'regular' | 'intensive'; start_date: string; end_date: string }[]}
      />
      <MakeupAssignmentList
        assignments={(assignments ?? []) as unknown as MakeupAssignment[]}
        todayStr={todayStr}
      />
    </div>
  )
}
