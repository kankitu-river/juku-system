import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { SurveyManager } from './SurveyManager'

export default async function ShiftSurveyPage() {
  const supabase = await createClient()

  const { data: surveys } = await supabase
    .from('shift_surveys')
    .select(`
      *,
      tokens:shift_survey_tokens(
        id, token, teacher_id, responded_at,
        teacher:teachers(id, name)
      )
    `)
    .order('created_at', { ascending: false })

  const { data: teachers } = await supabase
    .from('teachers')
    .select('id, name')
    .order('name')

  return (
    <div>
      <Header
        title="出勤アンケート"
        subtitle="月次の出勤可能日を先生から収集します"
      />
      <SurveyManager
        surveys={surveys ?? []}
        teacherCount={teachers?.length ?? 0}
      />
    </div>
  )
}
