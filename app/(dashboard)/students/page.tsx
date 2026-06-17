import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { StudentImport } from '@/components/students/StudentImport'
import Link from 'next/link'
import type { Student, Teacher } from '@/types'
import { getDisplayGrade, GRADE_ORDER } from '@/lib/utils/grade'
const DAY_LABELS: Record<number, string> = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' }
type FixedSlot = { day: number; slot: number }

export default async function StudentsPage() {
  const supabase = await createClient()
  const [{ data: students }, { data: teachers }] = await Promise.all([
    supabase.from('students').select('*').order('name'),
    supabase.from('teachers').select('id, name').order('name'),
  ])

  const sorted = (students as Student[] ?? []).sort(
    (a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade)
  )

  return (
    <div>
      <Header
        title="生徒管理"
        subtitle={`${students?.length ?? 0}名登録済み`}
        actions={
          <Link href="/students/new">
            <Button>+ 生徒を追加</Button>
          </Link>
        }
      />

      <div className="mb-5">
        <StudentImport teachers={(teachers as Teacher[]) ?? []} />
      </div>

      {sorted.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-600">氏名</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">学年</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">固定曜日</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">受講科目</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{student.name}</td>
                  <td className="px-5 py-3 text-gray-600">{getDisplayGrade(student.grade)}</td>
                  <td className="px-5 py-3">
                    {(student.fixed_slots as FixedSlot[] | undefined)?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {(student.fixed_slots as FixedSlot[]).map(({ day, slot }) => (
                          <span key={`${day}-${slot}`} className="text-[10px] bg-[#1E3A5F] text-white px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                            {DAY_LABELS[day]}・{slot}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">未設定</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {student.subjects.map((s) => (
                        <span key={s} className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/students/${student.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#1E3A5F] border border-[#1E3A5F] rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      編集
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-500 text-sm mb-4">生徒がまだ登録されていません</p>
          <Link href="/students/new">
            <Button>最初の生徒を登録する</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
