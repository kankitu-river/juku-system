import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { StudentForm } from '@/components/students/StudentForm'
import { updateStudent, deleteStudent } from '../actions'
import type { Student, Teacher } from '@/types'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StudentDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: student }, { data: teachers }, { data: lessons }, { data: enrollments }] = await Promise.all([
    supabase.from('students').select('*').eq('id', id).single(),
    supabase.from('teachers').select('id, name, subjects, grade_levels, email, role, created_at').order('name'),
    supabase.from('lessons').select('id, day_of_week, slot_index, subject, term_type, type, lesson_kind, teacher:teachers(id,name)').eq('lesson_kind', 'regular').order('day_of_week').order('slot_index'),
    supabase.from('lesson_enrollments').select('lesson_id').eq('student_id', id),
  ])

  if (!student) notFound()

  const enrolledLessonIds = (enrollments ?? []).map((e: { lesson_id: string }) => e.lesson_id)

  return (
    <div>
      <Header title={(student as Student).name} subtitle="生徒の詳細・編集" />
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl">
        <StudentForm
          student={student as Student}
          teachers={(teachers as Teacher[]) ?? []}
          lessons={(lessons as any[]) ?? []}
          enrolledLessonIds={enrolledLessonIds}
          onSave={updateStudent.bind(null, id)}
          onDelete={deleteStudent.bind(null, id)}
        />
      </div>
    </div>
  )
}
