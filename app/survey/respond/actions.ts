'use server'

import { createClient } from '@/lib/supabase/server'

export async function submitSurveyResponse(
  surveyId: string,
  teacherId: string,
  availableDates: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: token } = await supabase
    .from('shift_survey_tokens')
    .select('*')
    .eq('survey_id', surveyId)
    .eq('teacher_id', teacherId)
    .single()

  if (!token) return { error: '先生情報が見つかりません' }
  if (new Date(token.expires_at) < new Date()) return { error: 'このアンケートは締め切られています' }

  const { error: respError } = await supabase
    .from('shift_survey_responses')
    .upsert(
      {
        token_id: token.id,
        teacher_id: teacherId,
        available_dates: availableDates,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'token_id' }
    )

  if (respError) return { error: respError.message }

  await supabase
    .from('shift_survey_tokens')
    .update({ responded_at: new Date().toISOString() })
    .eq('id', token.id)

  return {}
}
