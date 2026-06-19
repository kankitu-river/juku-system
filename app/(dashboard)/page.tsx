import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { TodayLessons } from '@/components/dashboard/TodayLessons'
import Link from 'next/link'
import { getDisplayGrade } from '@/lib/utils/grade'

function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = new Date()
  const todayStr = toDateStr(today)
  const displayDate = today.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  const dayOfWeek = today.getDay() // 0=日曜

  const [
    { data: lessons },
    { data: termPeriods },
    { data: makeupCredits },
    { data: students },
  ] = await Promise.all([
    supabase
      .from('lessons')
      .select('*, teacher:teachers(name), enrollments:lesson_enrollments(student:students(id, name, grade)), attendances(student_id, status)')
      .eq('day_of_week', dayOfWeek)
      .order('slot_index'),
    supabase.from('term_periods').select('*')
      .lte('start_date', todayStr)
      .gte('end_date', todayStr),
    supabase.from('makeup_credits').select('student_id, total_credits, used_credits'),
    supabase.from('students').select('id, name, grade'),
  ])

  const currentTerm = termPeriods?.[0]

  const creditWithStudents = (makeupCredits ?? [])
    .map((mc) => ({
      ...mc,
      remaining: mc.total_credits - mc.used_credits,
      student: (students ?? []).find((s) => s.id === mc.student_id),
    }))
    .filter((mc) => mc.student)

  // 振替が3件以上たまっている生徒
  const highCreditStudents = creditWithStudents.filter((mc) => mc.remaining >= 3)
  // 振替残数が1以下（少ない）生徒
  const lowCreditStudents = creditWithStudents.filter((mc) => mc.remaining <= 1 && mc.remaining > 0)

  return (
    <div>
      <Header title="ダッシュボード" subtitle={displayDate} />

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">今日のコマ数</p>
          <p className="text-3xl font-bold text-[#1E3A5F]">
            {lessons?.length ?? 0}
            <span className="text-base font-normal text-gray-500 ml-1">コマ</span>
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">現在の期間区分</p>
          <p className="text-xl font-bold text-[#1E3A5F]">
            {currentTerm ? currentTerm.name : '通常期間'}
          </p>
          {currentTerm && (
            <p className="text-xs text-gray-400 mt-1">
              〜 {new Date(currentTerm.end_date).toLocaleDateString('ja-JP')}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">クイックリンク</p>
          <div className="flex flex-wrap gap-2 mt-1">
            <Link href="/schedule/new" className="text-sm text-[#1E3A5F] hover:underline font-medium">
              + コマ追加
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/students/new" className="text-sm text-[#1E3A5F] hover:underline font-medium">
              + 生徒追加
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/attendance/makeup" className="text-sm text-[#1E3A5F] hover:underline font-medium">
              振替管理
            </Link>
          </div>
        </div>
      </div>

      {/* 振替がたまりすぎ警告 */}
      {highCreditStudents.length > 0 && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-orange-600 font-semibold text-sm">📌 振替が3件以上たまっている生徒</span>
            <Link href="/attendance/makeup" className="ml-auto text-xs text-orange-700 hover:underline">
              振替管理へ →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {highCreditStudents.map((mc) => (
              <Link
                key={mc.student_id}
                href={`/students/${mc.student_id}`}
                className="flex items-center gap-1.5 bg-white border border-orange-200 rounded-lg px-3 py-1.5 hover:border-orange-400 transition-colors"
              >
                <span className="text-sm font-medium text-gray-800">{mc.student!.name}</span>
                <span className="text-xs text-gray-400">{getDisplayGrade(mc.student!.grade)}</span>
                <span className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  残{mc.remaining}件
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 振替残数が少ない警告 */}
      {lowCreditStudents.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-600 font-semibold text-sm">⚠ 振替残数が少ない生徒</span>
            <Link href="/attendance/makeup" className="ml-auto text-xs text-amber-700 hover:underline">
              振替管理へ →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowCreditStudents.map((mc) => (
              <Link
                key={mc.student_id}
                href={`/students/${mc.student_id}`}
                className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-lg px-3 py-1.5 hover:border-amber-400 transition-colors"
              >
                <span className="text-sm font-medium text-gray-800">{mc.student!.name}</span>
                <span className="text-xs text-gray-400">{getDisplayGrade(mc.student!.grade)}</span>
                <span className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  残{mc.remaining}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 今日のコマ + 出欠クイック入力 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">今日のコマと出欠入力</h2>
          <Link href="/schedule" className="text-sm text-[#1E3A5F] hover:underline">
            週次カレンダー →
          </Link>
        </div>
        <TodayLessons lessons={(lessons ?? []) as any} todayStr={todayStr} />
      </div>
    </div>
  )
}
