import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { REGULAR_SLOTS, INTENSIVE_SLOTS, GROUP_SATURDAY_SLOTS, SATURDAY_INDIVIDUAL_SLOTS } from '@/lib/constants/timeSlots'
import type { Lesson, TermPeriod } from '@/types'
import { PrintButton } from '@/components/print/PrintButton'

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

type SlotInfo = { index: number; start: string; end: string }

// その日・授業種別・期間区分に対応するスロット定義を返す
function getSlotDef(slotIndex: number, lessonType: 'group' | 'individual', dow: number, termType: 'regular' | 'intensive'): SlotInfo | null {
  if (termType === 'intensive') return INTENSIVE_SLOTS.find(s => s.index === slotIndex) ?? null
  if (dow === 6 && lessonType === 'group') return GROUP_SATURDAY_SLOTS.find(s => s.index === slotIndex) ?? null
  if (dow === 6 && lessonType === 'individual') return SATURDAY_INDIVIDUAL_SLOTS.find(s => s.index === slotIndex) ?? null
  return REGULAR_SLOTS.find(s => s.index === slotIndex) ?? null
}

// 曜日・期間のデフォルトスロット一覧（コマなし時に空枠を表示するため）
function getDefaultSlots(dow: number, termType: 'regular' | 'intensive'): SlotInfo[] {
  if (termType === 'intensive') return INTENSIVE_SLOTS
  if (dow === 6) {
    // 土曜: 個別 + 集団を時間順にマージ（重複時間は1つに）
    const all = [...SATURDAY_INDIVIDUAL_SLOTS, ...GROUP_SATURDAY_SLOTS]
      .sort((a, b) => a.start.localeCompare(b.start))
    const seen = new Set<string>()
    return all.filter(s => { if (seen.has(s.start)) return false; seen.add(s.start); return true })
  }
  return REGULAR_SLOTS
}

export default async function DayPrintPage({ searchParams }: PageProps) {
  const { date } = await searchParams
  const refDate = date ? new Date(date) : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const dateStr = toLocalDate(refDate)
  const dow = refDate.getDay()
  const fullDateLabel = refDate.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  const prevDay = new Date(refDate); prevDay.setDate(refDate.getDate() - 1)
  const nextDay = new Date(refDate); nextDay.setDate(refDate.getDate() + 1)

  const supabase = await createClient()
  const [{ data: lessons }, { data: termPeriods }] = await Promise.all([
    supabase
      .from('lessons')
      .select(`
        *,
        teacher:teachers(id, name),
        booth:booths(id, name),
        enrollments:lesson_enrollments(id, student_id, student:students(id, name))
      `)
      .eq('day_of_week', dow)
      .order('slot_index'),
    supabase.from('term_periods').select('*').order('start_date'),
  ])

  const activeTerm = (termPeriods as TermPeriod[] ?? []).find(
    (t) => t.start_date <= dateStr && t.end_date >= dateStr
  )
  const currentTermType = activeTerm?.type ?? 'regular'

  const typedLessons = ((lessons as Lesson[]) ?? []).filter(
    (l) => l.term_type === currentTermType
  )

  // コマごとに lessons をグループ化（時間帯ごとの枠を構築）
  // key: "start-end" でユニーク化
  type SlotGroup = SlotInfo & { lessons: Lesson[] }
  const slotGroupMap = new Map<string, SlotGroup>()

  for (const lesson of typedLessons) {
    const slotDef = getSlotDef(lesson.slot_index, lesson.type as 'group' | 'individual', dow, currentTermType)
    if (!slotDef) continue
    const key = `${slotDef.start}-${slotDef.end}`
    if (!slotGroupMap.has(key)) {
      slotGroupMap.set(key, { ...slotDef, lessons: [] })
    }
    slotGroupMap.get(key)!.lessons.push(lesson)
  }

  // その日のデフォルトスロットも空枠として追加（授業がないコマも表示）
  for (const slot of getDefaultSlots(dow, currentTermType)) {
    const key = `${slot.start}-${slot.end}`
    if (!slotGroupMap.has(key)) {
      slotGroupMap.set(key, { ...slot, lessons: [] })
    }
  }

  // 時間順にソート
  const slotGroups = Array.from(slotGroupMap.values())
    .sort((a, b) => a.start.localeCompare(b.start))

  const slotCount = slotGroups.length

  return (
    <div className="bg-white min-h-screen">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 7mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          /* ページ全体: A4縦の印刷領域をちょうど埋める */
          .dpp-page {
            height: calc(297mm - 14mm);
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
          }

          /* ヘッダー */
          .dpp-header {
            flex-shrink: 0 !important;
            padding-bottom: 1.5mm !important;
            margin-bottom: 1.5mm !important;
            border-bottom: 1.5px solid #1E3A5F !important;
          }
          .dpp-header h1 { font-size: 13px !important; line-height: 1.2 !important; margin: 0 !important; }
          .dpp-header p  { font-size: 8px !important;  margin: 0 !important; }

          /* コマ一覧: 均等分割 */
          .dpp-slots {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 1mm !important;
            overflow: hidden !important;
          }

          /* コマ枠 */
          .dpp-slot {
            flex: 1 !important;
            min-height: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            border: 1px solid #9ca3af !important;
            border-radius: 0 !important;
            margin-bottom: 0 !important;
          }

          /* コマヘッダー（濃紺） */
          .dpp-slot-hdr {
            flex-shrink: 0 !important;
            padding: 1mm 3mm !important;
            gap: 5mm !important;
            background: #1E3A5F !important;
            color: white !important;
            display: flex !important;
            align-items: center !important;
          }
          .dpp-slot-hdr .slot-num  { font-size: 9px  !important; font-weight: 700 !important; }
          .dpp-slot-hdr .slot-time { font-size: 12px !important; font-weight: 700 !important; font-family: monospace !important; letter-spacing: 0 !important; }

          /* 授業カード行 */
          .dpp-slot-body {
            flex: 1 !important;
            min-height: 0 !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 1mm !important;
            padding: 1.5mm !important;
            overflow: hidden !important;
          }

          /* 授業カード */
          .dpp-card {
            flex: 1 !important;
            min-width: 22mm !important;
            max-width: 50mm !important;
            display: flex !important;
            flex-direction: column !important;
            border-radius: 2px !important;
            border-width: 1px !important;
            overflow: hidden !important;
          }
          .dpp-card-booth {
            flex-shrink: 0 !important;
            font-size: 7px !important;
            font-weight: 700 !important;
            padding: 0.5mm 2mm !important;
          }
          .dpp-card-body {
            flex: 1 !important;
            padding: 1mm 1.5mm !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 0.5mm !important;
          }
          .dpp-card-teacher { font-size: 11px !important; font-weight: 700 !important; line-height: 1.2 !important; margin: 0 !important; }
          .dpp-card-student { font-size: 9px  !important; line-height: 1.3 !important; margin: 0 !important; }
          .dpp-card-subject { font-size: 7px  !important; }
        }
      `}</style>

      {/* 画面上のコントロール */}
      <div className="no-print bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/schedule" className="text-sm text-gray-500 hover:text-gray-700">← 戻る</Link>
          <Link href={`/schedule/print/day?date=${toLocalDate(prevDay)}`}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100">
            ‹ 前日
          </Link>
          <span className="text-sm font-medium text-gray-700">{fullDateLabel}</span>
          <Link href={`/schedule/print/day?date=${toLocalDate(nextDay)}`}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100">
            翌日 ›
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {activeTerm && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
              {activeTerm.name}
            </span>
          )}
          <PrintButton label="印刷（縦A4）" />
        </div>
      </div>

      {/* 印刷コンテンツ */}
      <div className="max-w-3xl mx-auto p-6 print:p-0 print:max-w-none">
        {/* 画面プレビュー */}
        <div className="dpp-page">
          {/* ヘッダー */}
          <div className="dpp-header mb-4 pb-3 border-b-2 border-[#1E3A5F]">
            <h1 className="text-2xl font-bold text-[#1E3A5F] print:text-xl leading-tight">
              {fullDateLabel}
            </h1>
            {activeTerm && (
              <p className="text-sm text-amber-700 mt-0.5">{activeTerm.name}</p>
            )}
          </div>

          {/* コマ一覧 */}
          <div className="dpp-slots flex flex-col gap-3 print:gap-0">
            {slotGroups.map((slot) => (
              <div key={`${slot.start}-${slot.end}`}
                className="dpp-slot flex flex-col border border-gray-300 rounded-lg print:rounded-none overflow-hidden"
                style={{ minHeight: `${Math.floor(100 / slotCount)}%` }}>
                {/* コマヘッダー */}
                <div className="dpp-slot-hdr bg-[#1E3A5F] text-white flex items-center gap-6 px-4 py-2.5 print:px-3 print:py-1.5">
                  <span className="slot-num font-bold text-base print:text-sm">
                    第{slot.index}コマ
                  </span>
                  <span className="slot-time font-bold text-xl print:text-base font-mono tracking-wide">
                    {slot.start}　〜　{slot.end}
                  </span>
                </div>

                {/* 授業カード */}
                <div className="dpp-slot-body flex flex-wrap gap-3 p-3 print:gap-1.5 print:p-2 flex-1">
                  {slot.lessons.length > 0 ? (
                    slot.lessons
                      .sort((a, b) => {
                        const ba = (a as { booth?: { name: string } }).booth?.name ?? ''
                        const bb = (b as { booth?: { name: string } }).booth?.name ?? ''
                        return ba.localeCompare(bb, 'ja')
                      })
                      .map((lesson) => (
                        <LessonPosterCard key={lesson.id} lesson={lesson} />
                      ))
                  ) : (
                    <div className="dpp-empty flex-1 flex items-center justify-center text-gray-300 text-sm print:text-xs">
                      授業なし
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function LessonPosterCard({ lesson }: { lesson: Lesson }) {
  const isGroup = lesson.type === 'group'
  const teacher = (lesson as { teacher?: { name: string } }).teacher
  const booth = (lesson as { booth?: { name: string } }).booth
  const students = (lesson.enrollments ?? [])
    .map((e: { student?: { id: string; name: string } }) => e.student)
    .filter(Boolean) as { id: string; name: string }[]

  return (
    <div className={[
      'dpp-card flex-1 flex flex-col rounded-lg border-2 print:rounded overflow-hidden',
      'min-w-[130px] print:min-w-[28mm]',
      isGroup
        ? 'border-purple-400 bg-purple-50'
        : 'border-teal-400 bg-teal-50',
    ].join(' ')}>
      {/* ブース */}
      {booth?.name && (
        <div className={[
          'dpp-card-booth text-xs font-bold px-3 py-1 print:px-2 print:py-0.5 border-b',
          isGroup
            ? 'bg-purple-200 border-purple-300 text-purple-800'
            : 'bg-teal-200 border-teal-300 text-teal-800',
        ].join(' ')}>
          {booth.name}
        </div>
      )}

      <div className="dpp-card-body flex flex-col gap-1 p-3 print:p-2">
        {/* 先生名 */}
        {teacher?.name ? (
          <p className={[
            'dpp-card-teacher font-bold text-lg print:text-sm leading-tight',
            isGroup ? 'text-purple-900' : 'text-teal-900',
          ].join(' ')}>
            {teacher.name}
          </p>
        ) : (
          <p className="text-sm text-gray-400 print:text-xs">担当未設定</p>
        )}

        {/* 生徒 */}
        <div className="space-y-0.5">
          {students.length > 0 ? (
            students.map((s, i) => (
              <p key={i} className="text-sm print:text-[10px] leading-snug text-gray-800">
                {s.name}
                <span className="text-gray-500 ml-1 text-xs print:text-[8px]">
                  （{lesson.subject}）
                </span>
              </p>
            ))
          ) : (
            <p className="text-xs text-gray-400">生徒未登録</p>
          )}
        </div>
      </div>
    </div>
  )
}
