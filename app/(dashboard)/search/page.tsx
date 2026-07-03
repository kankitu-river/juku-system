import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { getDisplayGrade } from '@/lib/utils/grade'

interface PageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q = '' } = await searchParams
  const query = q.trim()

  const supabase = await createClient()

  const [{ data: students }, { data: teachers }, { data: lessons }] = query
    ? await Promise.all([
        supabase.from('students').select('id, name, grade').ilike('name', `%${query}%`).limit(10),
        supabase.from('teachers').select('id, name, subjects').ilike('name', `%${query}%`).limit(10),
        supabase.from('lessons').select('id, subject, type, day_of_week, slot_index, teacher:teachers(name)').or(`subject.ilike.%${query}%,title.ilike.%${query}%`).limit(10),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const total = (students?.length ?? 0) + (teachers?.length ?? 0) + (lessons?.length ?? 0)
  const DAY = ['', '月', '火', '水', '木', '金', '土']

  return (
    <div>
      <Header title="検索" subtitle="生徒・先生・コマを横断検索" />

      <form method="GET" action="/search" className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="名前・科目で検索..."
            autoFocus
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-navy shadow-sm"
          />
          <button
            type="submit"
            className="px-5 py-3 bg-navy text-white text-sm font-medium rounded-xl hover:bg-navy-dark transition-colors"
          >
            検索
          </button>
        </div>
      </form>

      {query && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          「{query}」の検索結果：{total}件
        </p>
      )}

      {!query && (
        <div className="bg-gray-50 dark:bg-gray-900/50 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-10 text-center text-gray-400 text-sm">
          検索キーワードを入力してください
        </div>
      )}

      {query && total === 0 && (
        <div className="bg-gray-50 dark:bg-gray-900/50 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-10 text-center text-gray-400 text-sm">
          「{query}」に一致する結果が見つかりませんでした
        </div>
      )}

      <div className="space-y-5">
        {(students?.length ?? 0) > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">生徒</h2>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm divide-y divide-gray-50 dark:divide-gray-700">
              {students!.map((s) => (
                <Link key={s.id} href={`/students/${s.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    生
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.name}</p>
                    <p className="text-xs text-gray-400">{getDisplayGrade(s.grade)}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(teachers?.length ?? 0) > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">先生</h2>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm divide-y divide-gray-50 dark:divide-gray-700">
              {teachers!.map((t) => (
                <Link key={t.id} href={`/teachers/${t.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    師
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t.name}</p>
                    <p className="text-xs text-gray-400">{(t.subjects as string[])?.join('・') || '担当科目未設定'}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(lessons?.length ?? 0) > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">コマ</h2>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm divide-y divide-gray-50 dark:divide-gray-700">
              {lessons!.map((l: any) => (
                <Link key={l.id} href={`/schedule/${l.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className={[
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                    l.type === 'group' ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300' : 'bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300',
                  ].join(' ')}>
                    {l.type === 'group' ? '集' : '個'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{l.subject}</p>
                    <p className="text-xs text-gray-400">
                      {DAY[l.day_of_week] ?? ''}曜 第{l.slot_index}コマ
                      {l.teacher?.name ? ` · ${l.teacher.name}` : ''}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
