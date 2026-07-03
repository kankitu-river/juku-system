import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { getDisplayGrade } from '@/lib/utils/grade'

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default async function AttendanceReportPage({ searchParams }: PageProps) {
  const today = new Date()
  const { year: yearStr, month: monthStr } = await searchParams
  const year = Number(yearStr ?? today.getFullYear())
  const month = Number(monthStr ?? today.getMonth() + 1)

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = toDateStr(new Date(year, month, 0))

  const supabase = await createClient()

  const [{ data: students }, { data: attendances }, { data: enrollments }] = await Promise.all([
    supabase.from('students').select('id, name, grade').order('grade').order('name'),
    supabase.from('attendances').select('student_id, status, date').gte('date', startDate).lte('date', endDate),
    supabase.from('lesson_enrollments').select('student_id, lesson_id'),
  ])

  // 生徒ごとの集計
  type Summary = {
    present: number
    absent: number
    makeup: number
    total: number
  }
  const summaryMap = new Map<string, Summary>()
  for (const s of students ?? []) {
    summaryMap.set(s.id, { present: 0, absent: 0, makeup: 0, total: 0 })
  }
  for (const a of attendances ?? []) {
    const s = summaryMap.get(a.student_id)
    if (!s) continue
    s.total++
    if (a.status === 'present') s.present++
    else if (a.status === 'absent') s.absent++
    else if (a.status === 'makeup_used') s.makeup++
  }

  // 生徒ごとの受講コマ数（登録数）
  const enrollCountMap = new Map<string, number>()
  for (const e of enrollments ?? []) {
    enrollCountMap.set(e.student_id, (enrollCountMap.get(e.student_id) ?? 0) + 1)
  }

  const rows = (students ?? []).map((s) => ({
    ...s,
    summary: summaryMap.get(s.id) ?? { present: 0, absent: 0, makeup: 0, total: 0 },
    enrollCount: enrollCountMap.get(s.id) ?? 0,
  }))

  const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }

  return (
    <div>
      <Header
        title="出欠集計レポート"
        subtitle={`${year}年${month}月`}
        actions={
          <Link href="/attendance" className="text-sm text-navy hover:underline">
            ← 出欠管理
          </Link>
        }
      />

      {/* 月選択 */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`/attendance/report?year=${prevMonth.year}&month=${prevMonth.month}`}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
        >
          ‹ 前月
        </Link>
        <span className="font-semibold text-gray-800">{year}年{month}月</span>
        <Link
          href={`/attendance/report?year=${nextMonth.year}&month=${nextMonth.month}`}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
        >
          翌月 ›
        </Link>
        <span className="ml-auto text-xs text-gray-400">{startDate} 〜 {endDate}</span>
      </div>

      {/* サマリー */}
      {(() => {
        const totalPresent = rows.reduce((s, r) => s + r.summary.present, 0)
        const totalAbsent = rows.reduce((s, r) => s + r.summary.absent, 0)
        const totalRecords = rows.reduce((s, r) => s + r.summary.total, 0)
        const rate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0
        const alertStudents = rows.filter((r) => r.summary.total > 0 && r.summary.present / r.summary.total < 0.6)
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{totalPresent}</p>
              <p className="text-xs text-gray-400 mt-0.5">出席数</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-red-500">{totalAbsent}</p>
              <p className="text-xs text-gray-400 mt-0.5">欠席数</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-navy">{rate}%</p>
              <p className="text-xs text-gray-400 mt-0.5">全体出席率</p>
            </div>
            <div className={[
              'rounded-xl border shadow-sm p-4 text-center',
              alertStudents.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100',
            ].join(' ')}>
              <p className={['text-2xl font-bold', alertStudents.length > 0 ? 'text-amber-600' : 'text-gray-400'].join(' ')}>
                {alertStudents.length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">出席率60%未満</p>
            </div>
          </div>
        )
      })()}

      {/* 生徒別テーブル */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy text-white text-xs">
                <th className="text-left px-4 py-3 font-medium">生徒名</th>
                <th className="text-center px-3 py-3 font-medium">学年</th>
                <th className="text-center px-3 py-3 font-medium">出席</th>
                <th className="text-center px-3 py-3 font-medium">欠席</th>
                <th className="text-center px-3 py-3 font-medium">振替</th>
                <th className="text-center px-3 py-3 font-medium">記録計</th>
                <th className="text-center px-3 py-3 font-medium">出席率</th>
                <th className="text-center px-3 py-3 font-medium">状態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, i) => {
                const { present, absent, makeup, total } = row.summary
                const rate = total > 0 ? Math.round((present / total) * 100) : null
                const isAlert = rate !== null && rate < 60
                const isWarning = rate !== null && rate >= 60 && rate < 80
                return (
                  <tr key={row.id} className={[
                    i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white',
                    isAlert ? 'bg-red-50/50' : '',
                  ].join(' ')}>
                    <td className="px-4 py-3">
                      <Link href={`/students/${row.id}`} className="font-medium text-gray-900 hover:text-navy hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500 text-xs">{getDisplayGrade(row.grade)}</td>
                    <td className="px-3 py-3 text-center font-medium text-green-600">{present || '—'}</td>
                    <td className="px-3 py-3 text-center font-medium text-red-500">{absent || '—'}</td>
                    <td className="px-3 py-3 text-center font-medium text-amber-600">{makeup || '—'}</td>
                    <td className="px-3 py-3 text-center text-gray-500">{total || '—'}</td>
                    <td className="px-3 py-3 text-center">
                      {rate !== null ? (
                        <span className={[
                          'inline-block font-bold',
                          isAlert ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-green-600',
                        ].join(' ')}>
                          {rate}%
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">記録なし</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {isAlert ? (
                        <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">要注意</span>
                      ) : isWarning ? (
                        <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">注意</span>
                      ) : rate !== null ? (
                        <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">良好</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
          出席率 60%未満 = 要注意（赤）、60〜79% = 注意（黄）、80%以上 = 良好（緑）
        </div>
      </div>
    </div>
  )
}
