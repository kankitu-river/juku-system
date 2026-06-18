import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { LessonForm } from '@/components/schedule/LessonForm'
import { createLesson, createRepeatingLessons } from '../actions'
import type { Teacher, Booth, Student, Lesson } from '@/types'
import type { IntensiveSlotLimits } from '@/lib/constants/timeSlots'

interface PageProps {
  searchParams: Promise<{ copy?: string; student?: string }>
}

export default async function NewLessonPage({ searchParams }: PageProps) {
  const { copy, student: studentId } = await searchParams
  const supabase = await createClient()

  const [{ data: teachers }, { data: booths }, { data: students }, { data: slotLimitSetting }] = await Promise.all([
    supabase.from('teachers').select('*').order('name'),
    supabase.from('booths').select('*').eq('is_active', true).order('name'),
    supabase.from('students').select('*').order('name'),
    supabase.from('app_settings').select('value').eq('key', 'intensive_slot_limits').single(),
  ])
  const intensiveSlotLimits = (slotLimitSetting?.value as IntensiveSlotLimits) ?? null

  let copySource: Lesson | null = null
  if (copy) {
    const { data } = await supabase
      .from('lessons')
      .select('*, teacher:teachers(id, name)')
      .eq('id', copy)
      .single()
    copySource = data as Lesson | null
  }

  const preselectedStudent = studentId
    ? (students as Student[] ?? []).find((s) => s.id === studentId) ?? null
    : null

  return (
    <div>
      <Header
        title={copySource ? `${(copySource.teacher as { name?: string } | null)?.name ?? copySource.subject}先生のコマをコピー` : 'コマを作成'}
        subtitle={preselectedStudent ? `${preselectedStudent.name} の受講コマを追加` : '新しいコマを追加します'}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl">
        <LessonForm
          lesson={copySource ?? undefined}
          teachers={(teachers as Teacher[]) ?? []}
          booths={(booths as Booth[]) ?? []}
          students={(students as Student[]) ?? []}
          enrolledStudentIds={preselectedStudent ? [preselectedStudent.id] : []}
          intensiveSlotLimits={intensiveSlotLimits}
          onSave={createLesson}
          onSaveRepeating={createRepeatingLessons}
        />
      </div>
    </div>
  )
}
