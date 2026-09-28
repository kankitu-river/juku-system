import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { LedgerTable, type LedgerRow } from './LedgerTable'

export default async function MakeupLedgerPage() {
  const supabase = await createClient()

  const [{ data, error }, { data: studentsData }] = await Promise.all([
    supabase
      .from('makeup_requests')
      .select('id, student_name, received_date, original_lesson, subject, desired_raw, scheduled_date, status, next_test_date, notes, source_sheet, assigned_lesson_id, assigned_date, student:students(id, name, grade)')
      .order('status', { ascending: true })
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('received_date', { ascending: false }),
    supabase.from('students').select('id, name, grade').order('name'),
  ])

  const rows = (data ?? []) as unknown as LedgerRow[]
  const students = (studentsData ?? []) as { id: string; name: string; grade: string }[]

  return (
    <div>
      <Header
        title="振替台帳"
        subtitle="スケ組みソフトの授業振替シートを取り込んだ一覧（未定・決定・消化済み）"
        actions={
          <Link
            href="/attendance/makeup"
            className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            振替管理へ
          </Link>
        }
      />
      {error ? (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm rounded-xl px-4 py-3">
          振替台帳の読み込みに失敗しました。マイグレーション 030_makeup_requests.sql を実行し、「設定 &gt; インポート」の④で取り込んでください。（{error.message}）
        </div>
      ) : (
        <LedgerTable rows={rows} students={students} />
      )}
    </div>
  )
}
