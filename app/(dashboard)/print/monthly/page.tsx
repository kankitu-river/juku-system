import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { MonthlyPrintManager } from './MonthlyPrintManager'
import type { Teacher, Student } from '@/types'

export default async function MonthlyPrintPage() {
  const supabase = await createClient()

  const [{ data: teachers }, { data: students }] = await Promise.all([
    supabase.from('teachers').select('id, name, email, role, subjects, grade_levels, created_at').order('name'),
    supabase.from('students').select('id, name, grade, subjects, preferred_teacher_ids, ng_teacher_ids, created_at').order('name'),
  ])

  return (
    <div>
      <Header
        title="月次個人スケジュール印刷"
        subtitle="先生・生徒ごとの月次スケジュールを印刷できます"
      />
      <MonthlyPrintManager
        teachers={(teachers as Teacher[]) ?? []}
        students={(students as Student[]) ?? []}
      />
    </div>
  )
}
