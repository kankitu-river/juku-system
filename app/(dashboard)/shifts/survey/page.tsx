import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { SurveyManager } from './SurveyManager'

export default async function ShiftSurveyPage() {
  const supabase = await createClient()

  const [{ data: surveys }, { data: teachers }, { data: termPeriods }] = await Promise.all([
    supabase
      .from('shift_surveys')
      .select(`
        *,
        tokens:shift_survey_tokens(
          id, token, teacher_id, responded_at,
          teacher:teachers(id, name)
        )
      `)
      .order('created_at', { ascending: false }),
    supabase.from('teachers').select('id, name').order('name'),
    supabase.from('term_periods').select('id, name, type, start_date, end_date')
      .eq('type', 'intensive')
      .order('start_date', { ascending: false }),
  ])

  return (
    <div>
      <Header
        title="出勤アンケート"
        subtitle="出勤可能日・コマを先生から収集します"
      />
      <SurveyManager
        surveys={surveys ?? []}
        teacherCount={teachers?.length ?? 0}
        intensivePeriods={(termPeriods ?? []) as { id: string; name: string; type: string; start_date: string; end_date: string }[]}
      />
    </div>
  )
}
