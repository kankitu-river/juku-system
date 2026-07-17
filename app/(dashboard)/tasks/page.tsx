import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { TaskList } from './TaskList'
import { autoGenerateTasks } from '@/lib/tasks/autoGenerate'
import { getJstTodayStr } from '@/lib/utils/datetime'
import Link from 'next/link'

export default async function TasksPage() {
  const supabase = await createClient()
  const today = getJstTodayStr()

  // テンプレートから自動生成（冪等）
  await autoGenerateTasks(supabase, today)

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, template_id, title, description, due_date, status, completed_at')
    .order('due_date', { ascending: true })

  const { data: templates } = await supabase
    .from('task_templates')
    .select('id, title, recurrence_type, recurrence_day_of_month, is_active')
    .order('recurrence_day_of_month', { ascending: true })

  type TaskRow = {
    id: string
    title: string
    description: string | null
    due_date: string
    status: 'pending' | 'in_progress' | 'done' | 'skipped'
    completed_at: string | null
    template_id: string | null
  }

  return (
    <div>
      <Header title="タスク管理" subtitle="締め切りタスクと繰り返し業務" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* タスクリスト */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">タスク一覧</h2>
          <TaskList initialTasks={(tasks ?? []) as TaskRow[]} />
        </div>

        {/* テンプレート一覧（読み取り専用） */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">繰り返しテンプレート</h2>
          <p className="text-xs text-gray-400 mb-4">毎月 自動でタスクを生成します</p>
          <div className="space-y-2">
            {(templates ?? []).map((t) => (
              <div
                key={t.id}
                className={[
                  'flex items-center gap-2 text-sm py-1.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0',
                  !t.is_active ? 'opacity-40' : '',
                ].join(' ')}
              >
                <span className={['w-2 h-2 rounded-full flex-shrink-0', t.is_active ? 'bg-green-400' : 'bg-gray-300'].join(' ')} />
                <span className="flex-1 text-gray-700 dark:text-gray-200 text-xs">{t.title}</span>
                {t.recurrence_type === 'monthly' && t.recurrence_day_of_month && (
                  <span className="text-[11px] text-gray-400 shrink-0">毎月{t.recurrence_day_of_month}日</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
            テンプレートの追加・編集は Supabase Dashboard の task_templates テーブルから行えます
          </p>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-400 dark:text-gray-500">
        テンプレートから自動生成されたタスクは削除できません。スキップを使用してください。 |{' '}
        <Link href="/" className="hover:underline">ダッシュボードに戻る</Link>
      </div>
    </div>
  )
}
