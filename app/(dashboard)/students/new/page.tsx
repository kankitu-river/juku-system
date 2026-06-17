import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { StudentForm } from '@/components/students/StudentForm'
import { createStudent } from '../actions'
import type { Teacher } from '@/types'

export default async function NewStudentPage() {
  const supabase = await createClient()
  const [{ data: teachers }, { data: lessons }] = await Promise.all([
    supabase.from('teachers').select('id, name, subjects, grade_levels, email, role, created_at').order('name'),
    supabase.from('lessons').select('id, day_of_week, slot_index, subject, term_type, type, lesson_kind, teacher:teachers(id,name)').eq('lesson_kind', 'regular').order('day_of_week').order('slot_index'),
  ])

  return (
    <div>
      <Header title="生徒を登録" subtitle="新しい生徒を追加します" />
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl">
        <StudentForm
          teachers={(teachers as Teacher[]) ?? []}
          lessons={(lessons as any[]) ?? []}
          enrolledLessonIds={[]}
          onSave={createStudent}
        />
      </div>
    </div>
  )
}
