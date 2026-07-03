import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { StudentImport } from '@/components/students/StudentImport'
import { StudentTable } from '@/components/students/StudentTable'
import Link from 'next/link'
import type { Student, Teacher } from '@/types'
import { GRADE_ORDER } from '@/lib/utils/grade'

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
        <StudentTable students={sorted} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-12 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">生徒がまだ登録されていません</p>
          <Link href="/students/new">
            <Button>最初の生徒を登録する</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
