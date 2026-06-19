import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { MakeupManager } from './MakeupManager'
import { AddCreditForm } from './AddCreditForm'

export default async function MakeupPage() {
  const supabase = await createClient()

  const [{ data: credits }, { data: lessons }, { data: teachers }, { data: shifts }, { data: students }] = await Promise.all([
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
  ])

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
      />
    </div>
  )
}
