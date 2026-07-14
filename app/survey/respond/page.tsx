import { createClient } from '@/lib/supabase/server'
import { SurveyRespond, type Token } from './SurveyRespond'
import { toDateStr } from '@/lib/utils/datetime'

interface PageProps {
  searchParams: Promise<{ id?: string; token?: string }>
}

// Convert date→slots map to day-of-week→slots pattern for comparison
function toDayPattern(slotsMap: Record<string, number[]>): Record<number, number[]> {
  const pattern: Record<number, Set<number>> = {}
  for (const [dateStr, slots] of Object.entries(slotsMap)) {
    if (!slots || slots.length === 0) continue
    const dow = new Date(dateStr + 'T12:00:00').getDay()
    if (!pattern[dow]) pattern[dow] = new Set()
    slots.forEach((s) => pattern[dow].add(s))
  }
  return Object.fromEntries(
    Object.entries(pattern).map(([dow, set]) => [Number(dow), [...set].sort((a, b) => a - b)])
  )
}

type VerifyTokenRow = { id: string; survey_id: string; teacher_id: string; expires_at: string }

export default async function SurveyRespondPage({ searchParams }: PageProps) {
  const { id, token } = await searchParams
  const supabase = await createClient()

  let surveyId: string
  let preselectedTeacherId: string | null = null

  if (token) {
    // P1-2: security definer RPC経由でのみ照合（全行列挙を防止）
    const { data: tokenRows } = await supabase.rpc('verify_survey_token', { p_token: token })
    const tokenRecord = (tokenRows as unknown as VerifyTokenRow[] | null)?.[0] ?? null

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

  // P1-2: security definer RPC経由でトークン一覧取得（先生選択UI用）
  const { data: tokenRows } = await supabase.rpc('get_survey_tokens', { p_survey_id: surveyId })
  const tokens = (tokenRows as unknown as Token[]) ?? []

  const tokenIds = tokens.map((t) => t.id)
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

  // 講習期間の場合: term_period_id があればその期間のみ、なければ全講習期間
  let intensivePeriodDates: string[] | null = null
  if (termType === 'intensive') {
    let query = supabase.from('term_periods').select('start_date, end_date').order('start_date')
    if (survey.term_period_id) {
      query = query.eq('id', survey.term_period_id) as typeof query
    } else {
      query = query.eq('type', 'intensive') as typeof query
    }
    const { data: termPeriods } = await query

    if (termPeriods && termPeriods.length > 0) {
      const allDates: string[] = []
      for (const period of termPeriods) {
        const start = new Date(period.start_date + 'T12:00:00')
        const end = new Date(period.end_date + 'T12:00:00')
        const d = new Date(start)
        while (d <= end) {
          allDates.push(toDateStr(d))
          d.setDate(d.getDate() + 1)
        }
      }
      intensivePeriodDates = allDates.filter((d) => !closureDates.includes(d))
    }
  }

  // 前回の回答パターンを取得（差分警告用）
  let previousDayPattern: Record<number, number[]> | null = null
  if (preselectedTeacherId) {
    // P1-2: security definer RPC経由で前回トークン取得
    const { data: prevTokenRows } = await supabase.rpc('get_teacher_prev_tokens', {
      p_teacher_id: preselectedTeacherId,
      p_current_survey_id: surveyId,
    })
    const prevTokens = (prevTokenRows as unknown as { id: string; survey_id: string }[] | null) ?? []

    if (prevTokens.length > 0) {
      const prevSurveyIds = prevTokens.map((t) => t.survey_id)
      const { data: prevSurveys } = await supabase
        .from('shift_surveys')
        .select('id, term_type')
        .in('id', prevSurveyIds)
        .eq('term_type', termType)

      const matchingTokenIds = prevTokens
        .filter((t) => prevSurveys?.some((s) => s.id === t.survey_id))
        .map((t) => t.id)

      if (matchingTokenIds.length > 0) {
        const { data: prevResponse } = await supabase
          .from('shift_survey_responses')
          .select('available_slots, submitted_at')
          .in('token_id', matchingTokenIds)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (prevResponse?.available_slots) {
          previousDayPattern = toDayPattern(prevResponse.available_slots as Record<string, number[]>)
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-navy text-white rounded-xl px-6 py-5 mb-6">
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
          tokens={tokens}
          slotsMap={slotsMap}
          closureDates={closureDates}
          intensivePeriodDates={intensivePeriodDates}
          preselectedTeacherId={preselectedTeacherId}
          previousDayPattern={previousDayPattern}
        />
      </div>
    </div>
  )
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center max-w-sm">
        <p className="text-lg font-semibold text-red-600 dark:text-red-300">{message}</p>
      </div>
    </div>
  )
}
