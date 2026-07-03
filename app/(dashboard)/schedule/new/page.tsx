import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { LessonForm } from '@/components/schedule/LessonForm'
import { createLesson, createRepeatingLessons } from '../actions'
import type { Teacher, Booth, Student, Lesson } from '@/types'
import type { IntensiveSlotLimits } from '@/lib/constants/timeSlots'

interface PageProps {
  searchParams: Promise<{
    copy?: string
    student?: string
    teacher_id?: string
    date?: string
    slot_index?: string
    term_type?: string
  }>
}

function dowFromDate(dateStr: string): number {
  if (!dateStr) return 1
  const d = new Date(dateStr)
  const js = d.getDay()
  return js === 0 ? 7 : js
}

export default async function NewLessonPage({ searchParams }: PageProps) {
  const { copy, student: studentId, teacher_id, date, slot_index, term_type } = await searchParams
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

  // 待機先生クリックからの臨時コマ事前入力
  let prefillLesson: Lesson | null = null
  if (!copy && teacher_id && date && slot_index) {
    prefillLesson = {
      id: '',
      title: '',
      type: 'individual',
      lesson_kind: 'temporary',
      specific_date: date,
      teacher_id,
      day_of_week: dowFromDate(date),
      slot_index: parseInt(slot_index),
      term_type: (term_type as 'regular' | 'intensive') ?? 'regular',
      booth_id: null,
      subject: '',
      capacity: 2,
      is_ps1: false,
      notes: null,
      created_at: '',
    }
  }

  // 講習割り振りの「+ 講習コマを追加」からの遷移: 講習期間を事前選択
  if (!copySource && !prefillLesson && term_type === 'intensive') {
    prefillLesson = {
      id: '',
      title: '',
      type: 'individual',
      lesson_kind: 'regular',
      specific_date: null,
      teacher_id: null,
      day_of_week: 1,
      slot_index: 1,
      term_type: 'intensive',
      booth_id: null,
      subject: '',
      capacity: 2,
      is_ps1: false,
      notes: null,
      created_at: '',
    } as Lesson
  }

  const preselectedStudent = studentId
    ? (students as Student[] ?? []).find((s) => s.id === studentId) ?? null
    : null

  const prefillTeacherName = prefillLesson?.teacher_id
    ? (teachers as Teacher[] ?? []).find((t) => t.id === prefillLesson!.teacher_id)?.name ?? null
    : null

  const sourceLesson = copySource ?? prefillLesson ?? undefined

  return (
    <div>
      <Header
        title={
          copySource
            ? `${(copySource.teacher as { name?: string } | null)?.name ?? copySource.subject}先生のコマをコピー`
            : prefillLesson?.lesson_kind === 'temporary'
              ? '臨時コマを作成'
              : prefillLesson?.term_type === 'intensive'
                ? '講習コマを作成'
                : 'コマを作成'
        }
        subtitle={
          preselectedStudent
            ? `${preselectedStudent.name} の受講コマを追加`
            : prefillTeacherName
              ? `${prefillTeacherName}先生 — 臨時コマ`
              : '新しいコマを追加します'
        }
      />

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 max-w-2xl">
        <LessonForm
          lesson={sourceLesson}
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
