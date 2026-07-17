import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText } from '@/lib/ai/client'

const SYSTEM_COMPARISON = `あなたは塾の学習分析アシスタントです。
生徒の出席率と同学年平均を比較して、1〜2文の建設的なコメントを作成してください。
比較を明示しつつ、前向きで保護者・生徒が読んでも不快にならない表現を使ってください。`

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const studentId = req.nextUrl.searchParams.get('studentId')
    if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 })

    const { data: student } = await supabase
      .from('students')
      .select('grade')
      .eq('id', studentId)
      .single()

    if (!student) return NextResponse.json({ error: '生徒が見つかりません' }, { status: 404 })

    const grade = student.grade as string

    // 同学年の生徒IDを取得
    const { data: gradeStudents } = await supabase
      .from('students')
      .select('id')
      .eq('grade', grade)

    const gradeStudentIds = (gradeStudents ?? []).map((s: { id: string }) => s.id)

    if (gradeStudentIds.length === 0) {
      return NextResponse.json({ error: '同学年データがありません' }, { status: 404 })
    }

    // 過去3ヶ月の出席データ
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const fromStr = threeMonthsAgo.toISOString().slice(0, 10)

    const [{ data: ownAttendances }, { data: gradeAttendances }] = await Promise.all([
      supabase
        .from('attendances')
        .select('status')
        .eq('student_id', studentId)
        .gte('date', fromStr),
      supabase
        .from('attendances')
        .select('status, student_id')
        .in('student_id', gradeStudentIds)
        .gte('date', fromStr),
    ])

    const calcRate = (rows: { status: string }[]) => {
      if (rows.length === 0) return 0
      const present = rows.filter((r) => r.status === 'present').length
      return Math.round((present / rows.length) * 100)
    }

    const ownRate = calcRate(ownAttendances ?? [])
    const avgRate = calcRate(gradeAttendances ?? [])

    const message = `出席率: この生徒 ${ownRate}%, ${grade}平均 ${avgRate}%`
    const result = await generateText(SYSTEM_COMPARISON, message, 200)

    return NextResponse.json({ ownRate, avgRate, comment: result.text })
  } catch (e) {
    console.error('grade-comparison error:', e)
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}
