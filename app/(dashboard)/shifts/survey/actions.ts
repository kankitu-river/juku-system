'use server'

import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { sendSurveyEmail } from '@/lib/email/survey'
import { REGULAR_SLOTS, INTENSIVE_SLOTS, SATURDAY_INDIVIDUAL_SLOTS } from '@/lib/constants/timeSlots'

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

export async function importSurveyToShifts(
  surveyId: string
): Promise<{ imported: number; skipped: number; error?: string }> {
  const supabase = await createClient()

  const { data: survey } = await supabase
    .from('shift_surveys')
    .select('term_type')
    .eq('id', surveyId)
    .single()

  if (!survey) return { imported: 0, skipped: 0, error: 'アンケートが見つかりません' }

  const termType = (survey.term_type ?? 'regular') as 'regular' | 'intensive'

  const { data: tokens } = await supabase
    .from('shift_survey_tokens')
    .select('id, teacher_id')
    .eq('survey_id', surveyId)

  if (!tokens || tokens.length === 0) return { imported: 0, skipped: 0 }

  const tokenIds = tokens.map((t) => t.id)
  const { data: responses } = await supabase
    .from('shift_survey_responses')
    .select('teacher_id, available_slots')
    .in('token_id', tokenIds)

  if (!responses || responses.length === 0) return { imported: 0, skipped: 0 }

  const shiftsToInsert: { teacher_id: string; date: string; start_time: string; end_time: string }[] = []
  let skipped = 0

  for (const response of responses) {
    const slotMap = (response.available_slots ?? {}) as Record<string, number[]>
    for (const [dateStr, slotIndices] of Object.entries(slotMap)) {
      if (!slotIndices || slotIndices.length === 0) { skipped++; continue }

      const dow = new Date(dateStr + 'T12:00:00').getDay()
      const allSlots =
        termType === 'intensive' ? INTENSIVE_SLOTS
        : dow === 6 ? SATURDAY_INDIVIDUAL_SLOTS
        : REGULAR_SLOTS

      const selectedDefs = allSlots.filter((s) => slotIndices.includes(s.index))
      if (selectedDefs.length === 0) { skipped++; continue }

      // 選択コマの最初〜最後をシフト時間として登録
      const startTime = selectedDefs.reduce((a, b) => (a.start < b.start ? a : b)).start
      const endTime = selectedDefs.reduce((a, b) => (a.end > b.end ? a : b)).end

      shiftsToInsert.push({
        teacher_id: response.teacher_id,
        date: dateStr,
        start_time: startTime + ':00',
        end_time: endTime + ':00',
      })
    }
  }

  if (shiftsToInsert.length === 0) return { imported: 0, skipped }

  // 対象の先生・日付の既存シフトを削除してから挿入
  const teacherIds = [...new Set(shiftsToInsert.map((s) => s.teacher_id))]
  const dates = [...new Set(shiftsToInsert.map((s) => s.date))]

  await supabase.from('shifts').delete().in('teacher_id', teacherIds).in('date', dates)

  const { error } = await supabase.from('shifts').insert(shiftsToInsert)
  if (error) return { imported: 0, skipped, error: error.message }

  return { imported: shiftsToInsert.length, skipped }
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
