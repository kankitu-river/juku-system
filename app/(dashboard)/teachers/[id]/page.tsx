import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { TeacherForm } from '@/components/teachers/TeacherForm'
import { updateTeacher, deleteTeacher } from '../actions'
import type { Teacher } from '@/types'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TeacherDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', id)
    .single()

  if (!teacher) notFound()

  const typedTeacher = teacher as Teacher

  return (
    <div>
      <Header title={typedTeacher.name} subtitle="先生の詳細・編集" />
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 max-w-2xl">
        <TeacherForm
          teacher={typedTeacher}
          onSave={updateTeacher.bind(null, id)}
          onDelete={deleteTeacher.bind(null, id)}
        />
      </div>
    </div>
  )
}
