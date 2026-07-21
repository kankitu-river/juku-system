'use server'

import { createClient } from '@/lib/supabase/server'

export async function submitSurveyResponse(
  surveyId: string,
  teacherId: string,
  availableSlots: Record<string, number[]>,
  maybeSlots: Record<string, number[]> = {},
  ngReasons: string[] = [],
  ngReasonNote: string = ''
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('submit_survey_response', {
    p_survey_id: surveyId,
    p_teacher_id: teacherId,
    p_available_slots: availableSlots,
    p_maybe_slots: maybeSlots,
    p_ng_reasons: ngReasons,
    p_ng_reason_note: ngReasonNote,
  })

  if (error) {
    if (error.message.includes('Token not found')) {
      // P1-2: 総当たり速度を落とすため照合失敗時に1秒待機
      await new Promise((r) => setTimeout(r, 1000))
      return { error: '先生情報が見つかりません' }
    }
    if (error.message.includes('Token expired')) {
      return { error: 'このアンケートは締め切られています' }
    }
    return { error: error.message }
  }

  return {}
}
