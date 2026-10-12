import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import type { Lesson } from '@/types'
import { getSlotLabel } from '@/lib/constants/timeSlots'
import { SlotEditor, type SlotLessonRow } from './SlotEditor'

const DOW_LABELS: Record<number, string> = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' }

interface PageProps {
  searchParams: Promise<{ dow?: string; slot?: string; term?: string; type?: string }>
}

export default async function SlotEditPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const dow = Number(sp.dow ?? '1')
  const slot = Number(sp.slot ?? '1')
  const term = (sp.term === 'intensive' ? 'intensive' : 'regular') as 'regular' | 'intensive'
  const type = (sp.type === 'group' ? 'group' : 'individual') as 'group' | 'individual'

  const supabase = await createClient()
  const [{ data: lessons }, { data: teachers }, { data: booths }, { data: students }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, teacher_id, booth_id, subject, capacity, is_ps1, enrollments:lesson_enrollments(student_id, subject, student:students(id, name, grade))')
      .eq('lesson_kind', 'regular')
      .eq('day_of_week', dow)
      .eq('slot_index', slot)
      .eq('term_type', term)
      .eq('type', type),
    supabase.from('teachers').select('id, name').order('name'),
    supabase.from('booths').select('id, name, is_active').eq('is_active', true).order('name'),
    supabase.from('students').select('id, name, grade').order('name'),
  ])

  type Row = {
    id: string
    teacher_id: string | null
    booth_id: string | null
    subject: string | null
    capacity: number
    is_ps1: boolean
    enrollments: { student_id: string; subject: string | null; student: { id: string; name: string; grade: string } | null }[]
  }
  const rows: SlotLessonRow[] = ((lessons ?? []) as unknown as Row[]).map((l) => ({
    id: l.id,
    teacher_id: l.teacher_id,
    booth_id: l.booth_id,
    subject: l.subject ?? '',
    capacity: l.capacity ?? 1,
    is_ps1: l.is_ps1 ?? false,
    students: (l.enrollments ?? [])
      .filter((e) => e.student)
      .map((e) => ({ id: e.student!.id, name: e.student!.name, grade: e.student!.grade, subject: e.subject ?? '' })),
  }))

  const slotLabel = getSlotLabel(slot, dow, term, type)

  return (
    <div>
      <Header
        title={`${DOW_LABELS[dow] ?? ''}曜 第${slot}コマ をまとめて編集`}
        subtitle={`${slotLabel}・${term === 'intensive' ? '講習期間' : '通常期間'}・${type === 'group' ? '集団' : '個別'}／この枠の全授業を一括で編集します`}
        actions={<Link href="/schedule" className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">← スケジュールへ</Link>}
      />
      <SlotEditor
        ctx={{ dow, slot, term, type }}
        initialRows={rows}
        teachers={(teachers ?? []) as { id: string; name: string }[]}
        booths={(booths ?? []) as { id: string; name: string }[]}
        students={(students ?? []) as { id: string; name: string; grade: string }[]}
      />
    </div>
  )
}
