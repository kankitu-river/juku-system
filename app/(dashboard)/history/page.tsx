import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { UndoButton } from './UndoButton'

type AuditLog = {
  id: string
  record_id: string
  action: string
  summary: string | null
  created_at: string
}

export default async function HistoryPage() {
  const supabase = await createClient()

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('id, record_id, action, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const typedLogs = (logs ?? []) as AuditLog[]

  return (
    <div>
      <Header title="操作履歴" subtitle="コマの作成・更新・削除の履歴（直近100件）" />

      {typedLogs.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400 dark:text-gray-500">
          まだ操作履歴がありません
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700">
          {typedLogs.map((log) => (
            <AuditLogRow key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  )
}

function AuditLogRow({ log }: { log: AuditLog }) {
  const date = new Date(log.created_at)
  const dateStr = date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <ActionBadge action={log.action} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
          {log.summary ?? '(詳細なし)'}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-gray-400">{dateStr}</span>
          <Link
            href={`/schedule/${log.record_id}`}
            className="text-xs text-navy dark:text-blue-300 hover:underline"
          >
            コマを開く →
          </Link>
        </div>
      </div>
      <UndoButton logId={log.id} />
    </div>
  )
}

function ActionBadge({ action }: { action: string }) {
  const styleMap: Record<string, string> = {
    create: 'bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300',
    update: 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300',
    delete: 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300',
    undo:   'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
  }
  const labelMap: Record<string, string> = {
    create: '作成',
    update: '更新',
    delete: '削除',
    undo:   '取消',
  }
  return (
    <span
      className={[
        'text-xs px-2.5 py-1 rounded-full font-medium shrink-0',
        styleMap[action] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
      ].join(' ')}
    >
      {labelMap[action] ?? action}
    </span>
  )
}
