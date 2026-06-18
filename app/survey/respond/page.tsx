import { createClient } from '@/lib/supabase/server'
import { SurveyRespond } from './SurveyRespond'

interface PageProps {
  searchParams: Promise<{ id?: string; token?: string }>
}

export default async function SurveyRespondPage({ searchParams }: PageProps) {
  const { id, token } = await searchParams
  const supabase = await createClient()

  let surveyId: string
  let preselectedTeacherId: string | null = null

  if (token) {
    const { data: tokenRecord } = await supabase
      .from('shift_survey_tokens')
      .select('id, survey_id, teacher_id, expires_at')
      .eq('token', token)
      .single()

    if (!tokenRecord) return <ErrorPage message="リンクが無効または期限切れです" />
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return <ErrorPage message="このリンクの有効期限が切れています" />
    }

    surveyId = tokenRecord.survey_id
    preselectedTeacherId = tokenRecord.teacher_id
  } else if (id) {
    surveyId = id
  } else {
    return <ErrorPage message="URLが正しくありません" />
  }

  const { data: survey } = await supabase
    .from('shift_surveys')
    .select('*')
    .eq('id', surveyId)
    .single()

  if (!survey) return <ErrorPage message="アンケートが見つかりません" />
  if (new Date(survey.deadline) < new Date()) {
    return <ErrorPage message={`このアンケートは締め切られています（期限: ${new Date(survey.deadline).toLocaleDateString('ja-JP')}）`} />
  }

  const { data: tokens } = await supabase
    .from('shift_survey_tokens')
    .select('id, teacher_id, responded_at, teacher:teachers(id, name)')
    .eq('survey_id', surveyId)
    .order('teacher_id')

  const tokenIds = (tokens ?? []).map((t) => t.id)
  const [{ data: responses }, { data: closures }] = await Promise.all([
    tokenIds.length > 0
      ? supabase.from('shift_survey_responses').select('teacher_id, available_slots').in('token_id', tokenIds)
      : Promise.resolve({ data: [] }),
    supabase.from('school_closures')
      .select('date')
      .gte('date', `${survey.target_month}-01`)
      .lte('date', `${survey.target_month}-31`),
  ])

  const slotsMap: Record<string, Record<string, number[]>> = {}
  for (const r of responses ?? []) {
    slotsMap[r.teacher_id] = (r.available_slots ?? {}) as Record<string, number[]>
  }

  const closureDates = (closures ?? []).map((c: { date: string }) => c.date)
  const termType = (survey.term_type ?? 'regular') as 'regular' | 'intensive'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-[#1E3A5F] text-white rounded-xl px-6 py-5 mb-6">
          <p className="text-sm opacity-70 mb-1">塾スケジュール管理システム</p>
          <h1 className="text-xl font-bold">出勤可能日アンケート</h1>
          <p className="text-sm opacity-80 mt-1">
            {survey.target_month.replace('-', '年')}月分
            {termType === 'intensive' && ' 【講習期間】'}
            {' · '}回答期限: {new Date(survey.deadline).toLocaleDateString('ja-JP')}
          </p>
        </div>

        <SurveyRespond
          surveyId={surveyId}
          targetMonth={survey.target_month}
          deadline={survey.deadline}
          termType={termType}
          tokens={(tokens ?? []) as any}
          slotsMap={slotsMap}
          closureDates={closureDates}
          preselectedTeacherId={preselectedTeacherId}
        />
      </div>
    </div>
  )
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center max-w-sm">
        <p className="text-lg font-semibold text-red-600">{message}</p>
      </div>
    </div>
  )
}
