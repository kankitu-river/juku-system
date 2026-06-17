import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BoothBoard } from './BoothBoard'
import Link from 'next/link'
import type { Booth, Lesson, TermPeriod } from '@/types'

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

export default async function BoothsPage({ searchParams }: PageProps) {
  const { date } = await searchParams
  const supabase = await createClient()

  const targetDate = date ? new Date(date) : new Date()
  const dateStr = toDateStr(targetDate)
  const dow = targetDate.getDay()

  const prevDate = new Date(targetDate); prevDate.setDate(prevDate.getDate() - 1)
  const nextDate = new Date(targetDate); nextDate.setDate(nextDate.getDate() + 1)

  const [{ data: booths }, { data: regularLessons }, { data: tempLessons }, { data: termPeriods }] = await Promise.all([
    supabase.from('booths').select('*').order('name'),
    supabase
      .from('lessons')
      .select('*, teacher:teachers(id, name), enrollments:lesson_enrollments(id, student:students(id, name))')
      .eq('day_of_week', dow)
      .eq('type', 'individual')
      .eq('lesson_kind', 'regular')
      .not('booth_id', 'is', null),
    supabase
      .from('lessons')
      .select('*, teacher:teachers(id, name), enrollments:lesson_enrollments(id, student:students(id, name))')
      .eq('specific_date', dateStr)
      .eq('type', 'individual')
      .eq('lesson_kind', 'temporary')
      .not('booth_id', 'is', null),
    supabase.from('term_periods').select('*').order('start_date'),
  ])

  const activeTerm = (termPeriods as TermPeriod[] ?? []).find(
    (t) => t.start_date <= dateStr && t.end_date >= dateStr
  )
  const currentTermType = activeTerm?.type ?? 'regular'

  const dayLessons = [
    ...((regularLessons as Lesson[]) ?? []).filter((l) => l.term_type === currentTermType),
    ...((tempLessons as Lesson[]) ?? []),
  ]

  const displayDate = targetDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })

  return (
    <div>
      <Header
        title="ブース管理"
        subtitle={`${displayDate} のブース割り当て`}
        actions={
          <div className="flex items-center gap-1">
            <Link href={`/booths?date=${toDateStr(prevDate)}`}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
              ‹ 前日
            </Link>
            <Link href="/booths"
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
              今日
            </Link>
            <Link href={`/booths?date=${toDateStr(nextDate)}`}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
              翌日 ›
            </Link>
          </div>
        }
      />
      <BoothBoard
        booths={(booths as Booth[]) ?? []}
        lessons={dayLessons}
        currentTermType={currentTermType}
        allBooths={(booths as Booth[]) ?? []}
      />
    </div>
  )
}
