import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { findExistingViolations } from '@/lib/utils/scheduleValidation'
import Link from 'next/link'

export default async function ValidationPage() {
  const supabase = await createClient()
  const violations = await findExistingViolations(supabase)

  const teacherViolations = violations.filter((v) => v.type === 'teacher')
  const studentViolations = violations.filter((v) => v.type === 'student')
  const boothViolations = violations.filter((v) => v.type === 'booth')

  return (
    <div>
      <Header
        title="スケジュール整合性チェック"
        subtitle="既存データのダブルブッキング・競合を一括検査します"
      />

      {violations.length === 0 ? (
        <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-xl p-8 text-center">
          <p className="text-lg font-semibold text-green-700 dark:text-green-300">違反なし</p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">現在のコマデータに競合は見つかりませんでした。</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-sm text-amber-800 dark:text-amber-200">
            <span className="font-semibold">{violations.length}件の競合</span>
            <span>が見つかりました。該当コマのリンクから修正してください。</span>
          </div>

          {teacherViolations.length > 0 && (
            <ViolationSection
              title="講師ダブルブッキング"
              description="同じ時間帯に同じ講師が複数のコマに割り当てられています。"
              severity="error"
              violations={teacherViolations}
            />
          )}

          {studentViolations.length > 0 && (
            <ViolationSection
              title="生徒ダブルブッキング"
              description="同じ時間帯に同じ生徒が複数のコマに登録されています。"
              severity="error"
              violations={studentViolations}
            />
          )}

          {boothViolations.length > 0 && (
            <ViolationSection
              title="ブース重複"
              description="同じ時間帯に同じブースが複数のコマで使用されています。"
              severity="warning"
              violations={boothViolations}
            />
          )}
        </div>
      )}
    </div>
  )
}

function ViolationSection({
  title,
  description,
  severity,
  violations,
}: {
  title: string
  description: string
  severity: 'error' | 'warning'
  violations: { lessonIds: string[]; label: string }[]
}) {
  const isError = severity === 'error'
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h2>
        <span className={[
          'text-xs px-2 py-0.5 rounded-full font-medium',
          isError
            ? 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300'
            : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
        ].join(' ')}>
          {violations.length}件
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{description}</p>
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm divide-y divide-gray-50 dark:divide-gray-700">
        {violations.map((v, i) => (
          <div key={i} className="px-4 py-3">
            <p className="text-sm text-gray-800 dark:text-gray-100 mb-1.5">{v.label}</p>
            <div className="flex flex-wrap gap-2">
              {v.lessonIds.map((id) => (
                <Link key={id} href={`/schedule/${id}`}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-navy text-navy dark:text-blue-300 hover:bg-blue-50 transition-colors">
                  コマを開く →
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
