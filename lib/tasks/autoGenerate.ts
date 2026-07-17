import type { SupabaseClient } from '@supabase/supabase-js'

interface TaskTemplate {
  id: string
  title: string
  description: string | null
  recurrence_type: string
  recurrence_day_of_month: number | null
  recurrence_day_of_week: number | null
}

async function ensureMonthlyTask(
  supabase: SupabaseClient,
  template: TaskTemplate,
  year: number,
  month: number
) {
  const mm = String(month).padStart(2, '0')
  const dd = String(template.recurrence_day_of_month!).padStart(2, '0')
  const dueDate = `${year}-${mm}-${dd}`
  const monthStart = `${year}-${mm}-01`
  const monthEnd = `${year}-${mm}-28`  // 28日以内なのでオーバーしない

  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('template_id', template.id)
    .gte('due_date', monthStart)
    .lte('due_date', monthEnd)
    .limit(1)

  if (!existing || existing.length === 0) {
    await supabase.from('tasks').insert({
      template_id: template.id,
      title: template.title,
      description: template.description,
      due_date: dueDate,
    })
  }
}

export async function autoGenerateTasks(supabase: SupabaseClient, todayStr: string) {
  const { data: templates } = await supabase
    .from('task_templates')
    .select('id, title, description, recurrence_type, recurrence_day_of_month, recurrence_day_of_week')
    .eq('is_active', true)

  if (!templates || templates.length === 0) return

  const [yearStr, monthStr] = todayStr.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)

  for (const t of templates as TaskTemplate[]) {
    if (t.recurrence_type === 'monthly' && t.recurrence_day_of_month) {
      await ensureMonthlyTask(supabase, t, year, month)

      // 当月の締め切りを過ぎていたら翌月分も生成
      const mm = String(month).padStart(2, '0')
      const dd = String(t.recurrence_day_of_month).padStart(2, '0')
      const currentDue = `${year}-${mm}-${dd}`
      if (todayStr > currentDue) {
        const nextMonth = month === 12 ? 1 : month + 1
        const nextYear = month === 12 ? year + 1 : year
        await ensureMonthlyTask(supabase, t, nextYear, nextMonth)
      }
    }
  }
}
