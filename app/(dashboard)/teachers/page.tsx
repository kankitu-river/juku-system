import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { TeacherImport } from '@/components/teachers/TeacherImport'
import Link from 'next/link'
import type { Teacher } from '@/types'

export default async function TeachersPage() {
  const supabase = await createClient()
  const { data: teachers } = await supabase
    .from('teachers')
    .select('*')
    .order('name')

  return (
    <div>
      <Header
        title="先生管理"
        subtitle={`${teachers?.length ?? 0}名登録済み`}
        actions={
          <Link href="/teachers/new">
            <Button>+ 先生を追加</Button>
          </Link>
        }
      />

      <div className="mb-6 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <p className="text-sm font-semibold text-gray-700 mb-3">CSVで一括登録</p>
        <TeacherImport />
      </div>

      {teachers && teachers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(teachers as Teacher[]).map((teacher) => (
            <Link
              key={teacher.id}
              href={`/teachers/${teacher.id}`}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-navy transition-colors block"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{teacher.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{teacher.email}</p>
                </div>
                <Badge variant={teacher.role === 'admin' ? 'intensive' : 'default'}>
                  {teacher.role === 'admin' ? '管理者' : 'スタッフ'}
                </Badge>
              </div>

              {teacher.subjects.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {teacher.subjects.map((s) => (
                    <span key={s} className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {teacher.grade_levels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {teacher.grade_levels.map((g) => (
                    <span key={g} className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-gray-500 text-sm mb-4">先生がまだ登録されていません</p>
          <Link href="/teachers/new">
            <Button>最初の先生を登録する</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
