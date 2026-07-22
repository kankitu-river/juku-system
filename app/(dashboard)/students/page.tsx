import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { StudentImport } from '@/components/students/StudentImport'
import { StudentTable } from '@/components/students/StudentTable'
import Link from 'next/link'
import type { Student, Teacher } from '@/types'
import { GRADE_ORDER } from '@/lib/utils/grade'
import { EmptyState } from '@/components/ui/EmptyState'

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
        <EmptyState message="生徒が登録されていません" actionLabel="+ 生徒を追加" actionHref="/students/new" />
      )}
    </div>
  )
}
