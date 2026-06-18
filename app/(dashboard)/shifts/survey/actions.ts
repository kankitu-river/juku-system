'use server'

import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { sendSurveyEmail } from '@/lib/email/survey'

export async function createSurvey(data: {
  target_month: string
  deadline: string
  term_type: 'regular' | 'intensive'
}): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: user } = await supabase.auth.getUser()
  const { data: teacher } = await supabase
    .from('teachers')
    .select('id')
    .eq('email', user.user?.email ?? '')
    .single()

  const { data: survey, error } = await supabase
    .from('shift_surveys')
    .insert({ ...data, created_by: teacher?.id ?? null })
    .select()
    .single()

  if (error) return { error: error.message }

  // 全先生分のトークンを発行
  const { data: teachers } = await supabase.from('teachers').select('id')
  if (teachers && teachers.length > 0) {
    const tokens = teachers.map((t) => ({
      survey_id: survey.id,
      teacher_id: t.id,
      token: randomUUID(),
      expires_at: new Date(data.deadline + 'T23:59:59').toISOString(),
    }))
    await supabase.from('shift_survey_tokens').insert(tokens)
  }

  return {}
}

export async function deleteSurvey(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('shift_surveys').delete().eq('id', id)
  if (error) return { error: error.message }
  return {}
}

export async function sendSurveyEmails(surveyId: string): Promise<{ sent: number; errors: string[] }> {
  const supabase = await createClient()

  const { data: tokens } = await supabase
    .from('shift_survey_tokens')
    .select('*, survey:shift_surveys(*), teacher:teachers(id, name, email)')
    .eq('survey_id', surveyId)
    .is('responded_at', null)

  if (!tokens || tokens.length === 0) return { sent: 0, errors: [] }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const errors: string[] = []
  let sent = 0

  for (const token of tokens) {
    const teacher = token.teacher as { id: string; name: string; email: string } | null
    const survey = token.survey as { target_month: string; deadline: string } | null
    if (!teacher?.email || !survey) continue

    const result = await sendSurveyEmail({
      teacherName: teacher.name,
      teacherEmail: teacher.email,
      targetMonth: survey.target_month,
      deadline: survey.deadline,
      surveyUrl: `${baseUrl}/survey/respond?token=${token.token}`,
    })

    if (result.error) errors.push(`${teacher.name}: ${result.error}`)
    else sent++
  }

  return { sent, errors }
}
