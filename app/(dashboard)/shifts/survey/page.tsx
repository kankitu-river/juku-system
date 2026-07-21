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

  // 全アンケートの回答内容を取得
  const allTokenIds = (surveys ?? []).flatMap((s: { tokens?: { id: string }[] }) =>
    (s.tokens ?? []).map((t) => t.id)
  )
  const { data: allResponses } = allTokenIds.length > 0
    ? await supabase
        .from('shift_survey_responses')
        .select('token_id, teacher_id, available_slots, maybe_slots, ng_reasons, ng_reason_note, maybe_reasons, maybe_reason_note')
        .in('token_id', allTokenIds)
    : { data: [] }

  // survey_id → 回答リスト に変換
  type ResponseEntry = {
    teacherId: string
    availableSlots: Record<string, number[]>
    maybeSlots: Record<string, number[]>
    ngReasons: string[]
    ngReasonNote: string
    maybeReasons: string[]
    maybeReasonNote: string
  }
  const responsesBySurvey: Record<string, ResponseEntry[]> = {}
  for (const survey of surveys ?? []) {
    const tokenIdSet = new Set((survey.tokens ?? []).map((t: { id: string }) => t.id))
    responsesBySurvey[survey.id] = (allResponses ?? [])
      .filter((r: { token_id: string }) => tokenIdSet.has(r.token_id))
      .map((r: { teacher_id: string; available_slots: unknown; maybe_slots: unknown; ng_reasons: unknown; ng_reason_note: unknown; maybe_reasons: unknown; maybe_reason_note: unknown }) => ({
        teacherId: r.teacher_id,
        availableSlots: (r.available_slots ?? {}) as Record<string, number[]>,
        maybeSlots: (r.maybe_slots ?? {}) as Record<string, number[]>,
        ngReasons: (r.ng_reasons ?? []) as string[],
        ngReasonNote: (r.ng_reason_note ?? '') as string,
        maybeReasons: (r.maybe_reasons ?? []) as string[],
        maybeReasonNote: (r.maybe_reason_note ?? '') as string,
      }))
  }

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
        responsesBySurvey={responsesBySurvey}
      />
    </div>
  )
}
