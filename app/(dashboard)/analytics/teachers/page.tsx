import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { getDisplayGrade } from '@/lib/utils/grade'

export default async function TeachersContinuationPage() {
  const supabase = await createClient()

  const [{ data: teachers }, { data: enrollments }, { data: attendances }, { data: students }] = await Promise.all([
    supabase.from('teachers').select('id, name').order('name'),
    supabase
      .from('lesson_enrollments')
      .select('student_id, lesson_id, lesson:lessons(teacher_id, subject)'),
    supabase
      .from('attendances')
      .select('student_id, lesson_id, date, status'),
    supabase.from('students').select('id, name').eq('is_trial', false),
  ])

  // 講師×生徒ペアの受講記録を集計
  type PairStats = {
    teacherId: string
    teacherName: string
    studentId: string
    lessonCount: number
    absentCount: number
    firstDate: string | null
    lastDate: string | null
  }

  const teacherMap = new Map((teachers ?? []).map((t) => [t.id, t.name as string]))
  const studentMap = new Map((students ?? []).map((s) => [s.id, s.name as string]))

  // 受講登録から講師×生徒ペアを抽出
  const pairMap = new Map<string, { teacherId: string; studentId: string; lessonIds: Set<string> }>()
  for (const e of enrollments ?? []) {
    const lesson = e.lesson as unknown as { teacher_id: string | null; subject: string | null } | null
    if (!lesson?.teacher_id) continue
    const key = `${lesson.teacher_id}|${e.student_id}`
    if (!pairMap.has(key)) {
      pairMap.set(key, { teacherId: lesson.teacher_id, studentId: e.student_id as string, lessonIds: new Set() })
    }
    pairMap.get(key)!.lessonIds.add(e.lesson_id as string)
  }

  // 出席レコードから講師×生徒の出席情報を集計
  const attendanceMap = new Map<string, { dates: string[]; absentDates: string[] }>()
  for (const a of attendances ?? []) {
    // 出席のlessonからteacher_idを引く（enrollmentsで逆引き）
    const enrollment = (enrollments ?? []).find(
      (e) => e.lesson_id === a.lesson_id && e.student_id === a.student_id
    )
    const lesson = enrollment?.lesson as unknown as { teacher_id: string | null } | null
    if (!lesson?.teacher_id) continue
    const key = `${lesson.teacher_id}|${a.student_id}`
    if (!attendanceMap.has(key)) attendanceMap.set(key, { dates: [], absentDates: [] })
    const rec = attendanceMap.get(key)!
    rec.dates.push(a.date as string)
    if (a.status === 'absent') rec.absentDates.push(a.date as string)
  }

  // ペアごとの統計を構築
  const stats: PairStats[] = []
  pairMap.forEach(({ teacherId, studentId, lessonIds }, key) => {
    const teacherName = teacherMap.get(teacherId) ?? '—'
    const att = attendanceMap.get(key)
    const sortedDates = (att?.dates ?? []).sort()
    stats.push({
      teacherId,
      teacherName,
      studentId,
      lessonCount: lessonIds.size,
      absentCount: att?.absentDates.length ?? 0,
      firstDate: sortedDates[0] ?? null,
      lastDate: sortedDates[sortedDates.length - 1] ?? null,
    })
  })

  // 講師ごとにグループ化
  const teacherGroups = new Map<string, { name: string; pairs: PairStats[] }>()
  for (const s of stats) {
    if (!teacherGroups.has(s.teacherId)) {
      teacherGroups.set(s.teacherId, { name: s.teacherName, pairs: [] })
    }
    teacherGroups.get(s.teacherId)!.pairs.push(s)
  }

  // 継続率 = (出席回数 / 全記録回数) で計算
  const teacherSummaries = Array.from(teacherGroups.entries()).map(([id, g]) => {
    const totalLessons = g.pairs.reduce((s, p) => s + p.lessonCount, 0)
    const totalAbsents = g.pairs.reduce((s, p) => s + p.absentCount, 0)
    const totalAttendances = g.pairs.reduce((s, p) => s + (p.lessonCount - p.absentCount), 0)
    const attendanceRate = totalLessons > 0 ? Math.round((totalAttendances / totalLessons) * 100) : 0
    return { id, name: g.name, studentCount: g.pairs.length, totalLessons, totalAbsents, attendanceRate, pairs: g.pairs }
  }).sort((a, b) => b.studentCount - a.studentCount)

  return (
    <div>
      <Header title="講師継続率分析" subtitle="講師×生徒ペアの担当状況" />

      <div className="space-y-6">
        {teacherSummaries.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center text-gray-400 text-sm">
            受講登録データがありません
          </div>
        ) : (
          teacherSummaries.map((t) => (
            <div key={t.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">{t.name}</h3>
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{t.studentCount}名担当</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 ml-auto">
                  出席率 {t.attendanceRate}%
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400">
                      <th className="text-left pb-2 font-normal">生徒</th>
                      <th className="text-center pb-2 font-normal">担当コマ数</th>
                      <th className="text-center pb-2 font-normal">欠席回数</th>
                      <th className="text-center pb-2 font-normal">出席率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.pairs.sort((a, b) => b.lessonCount - a.lessonCount).map((p) => {
                      const attendedCount = p.lessonCount - p.absentCount
                      const rate = p.lessonCount > 0 ? Math.round((attendedCount / p.lessonCount) * 100) : 0
                      return (
                        <tr key={p.studentId} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                          <td className="py-2 text-gray-700 dark:text-gray-200">{studentMap.get(p.studentId) ?? '不明な生徒'}</td>
                          <td className="py-2 text-center text-gray-600 dark:text-gray-300">{p.lessonCount}</td>
                          <td className="py-2 text-center text-gray-600 dark:text-gray-300">{p.absentCount}</td>
                          <td className="py-2 text-center">
                            <span className={[
                              'text-xs font-bold px-1.5 py-0.5 rounded-full',
                              rate >= 80 ? 'bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300'
                                : rate >= 60 ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                                : 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300',
                            ].join(' ')}>
                              {rate}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
