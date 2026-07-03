import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { WeeklyShiftTable } from '@/components/shifts/WeeklyShiftTable'
import { CopyShiftsButton } from './CopyShiftsButton'
import Link from 'next/link'
import type { Teacher, Lesson } from '@/types'

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

function getWeekDates(referenceDate: Date): string[] {
  const d = new Date(referenceDate)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return Array.from({ length: 6 }, (_, i) => {
    const date = new Date(d)
    date.setDate(d.getDate() + i)
    return date.toISOString().split('T')[0]
  })
}

function formatWeekLabel(dates: string[]): string {
  const start = new Date(dates[0])
  const end = new Date(dates[5])
  return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日（月）〜${end.getMonth() + 1}月${end.getDate()}日（土）`
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split('T')[0]
}

export default async function ShiftsPage({ searchParams }: PageProps) {
  const { date } = await searchParams
  const referenceDate = date ? new Date(date) : new Date()
  const weekDates = getWeekDates(referenceDate)
  const weekLabel = formatWeekLabel(weekDates)

  const supabase = await createClient()

  const [{ data: teachers }, { data: shifts }, { data: lessons }, { data: termPeriods }] = await Promise.all([
    supabase.from('teachers').select('*').order('name'),
    supabase.from('shifts').select('*').in('date', weekDates),
    supabase.from('lessons').select('*, teacher:teachers(id, name)').not('teacher_id', 'is', null),
    supabase.from('term_periods').select('start_date, end_date, type').order('start_date'),
  ])

  const prevWeek = addWeeks(weekDates[0], -1)
  const nextWeek = addWeeks(weekDates[0], 1)
  const nextWeekDates = getWeekDates(new Date(nextWeek))
  const nextWeekLabel = formatWeekLabel(nextWeekDates)

  return (
    <div>
      <Header
        title="シフト管理"
        subtitle="週次シフト表"
        actions={
          <div className="flex items-center gap-3">
            <CopyShiftsButton
              currentWeekDates={weekDates}
              nextWeekLabel={nextWeekLabel}
              nextWeekDate={nextWeek}
            />
            <Link
              href="/shifts/manual-entry"
              className="text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              手動シフト入力
            </Link>
            <Link
              href="/shifts/survey"
              className="text-sm text-navy font-medium hover:underline"
            >
              出勤アンケート →
            </Link>
          </div>
        }
      />

      {/* 週ナビゲーション */}
      <div className="flex items-center gap-4 mb-4">
        <Link
          href={`/shifts?date=${prevWeek}`}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
        >
          ‹ 前週
        </Link>
        <span className="text-sm font-medium text-gray-700">{weekLabel}</span>
        <Link
          href={`/shifts?date=${nextWeek}`}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
        >
          翌週 ›
        </Link>
        <Link
          href="/shifts"
          className="ml-auto px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
        >
          今週
        </Link>
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-green-400" />
          シフトあり
        </span>
        <span className="flex items-center gap-1">
          <span className="text-amber-400">⚠</span>
          コマあり・シフト未登録
        </span>
        <span className="flex items-center gap-1">
          <span className="text-red-400">⚠ コマ外れ</span>
          シフト時間外にコマあり
        </span>
        <span className="text-gray-400 ml-auto text-[11px]">セルをクリックしてシフトを登録</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <WeeklyShiftTable
          teachers={(teachers as Teacher[]) ?? []}
          shifts={(shifts as { id: string; teacher_id: string; date: string; start_time: string; end_time: string }[]) ?? []}
          weekDates={weekDates}
          lessons={(lessons as Lesson[]) ?? []}
          termPeriods={(termPeriods ?? []) as { start_date: string; end_date: string; type: 'regular' | 'intensive' }[]}
        />
      </div>
    </div>
  )
}
