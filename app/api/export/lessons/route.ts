import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DAY = ['', '月', '火', '水', '木', '金', '土']

export async function GET() {
  const supabase = await createClient()
  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('*, teacher:teachers(name), booth:booths(name), enrollments:lesson_enrollments(student:students(name))')
    .order('day_of_week')
    .order('slot_index')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const header = ['科目', '授業形式', '期間区分', '曜日', '第コマ', '担当講師', 'ブース', '定員', '受講生徒数', '受講生徒', 'メモ']
  const rows = (lessons ?? []).map((l: any) => [
    l.subject ?? '',
    l.type === 'group' ? '集団授業' : '個別指導',
    l.term_type === 'intensive' ? '講習期間' : '通常期間',
    l.specific_date ? l.specific_date : (DAY[l.day_of_week] ?? ''),
    `第${l.slot_index}コマ`,
    l.teacher?.name ?? '',
    l.booth?.name ?? '',
    l.capacity,
    l.enrollments?.length ?? 0,
    (l.enrollments ?? []).map((e: any) => e.student?.name).filter(Boolean).join('・'),
    l.notes ?? '',
  ])

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')

  const bom = '﻿'
  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="lessons_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
