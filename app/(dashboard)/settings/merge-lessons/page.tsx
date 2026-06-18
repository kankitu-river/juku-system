import { Header } from '@/components/layout/Header'
import { getDuplicateGroups } from './actions'
import { MergeClient } from './MergeClient'

export default async function MergeLessonsPage() {
  const { groups, error } = await getDuplicateGroups()

  return (
    <div>
      <Header
        title="重複コマの統合"
        subtitle="同じ先生・同じ時間帯に複数登録されているコマを1つにまとめます"
      />
      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <div className="max-w-2xl">
          <MergeClient groups={groups} />
        </div>
      )}
    </div>
  )
}
