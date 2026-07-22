import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { REGULAR_SLOTS, INTENSIVE_SLOTS, GROUP_SATURDAY_SLOTS, SATURDAY_INDIVIDUAL_SLOTS } from '@/lib/constants/timeSlots'
import type { Lesson, TermPeriod } from '@/types'
import { PrintButton } from '@/components/print/PrintButton'
import { AutoPrint } from '@/components/print/AutoPrint'

interface PageProps {
  searchParams: Promise<{ date?: string; waiting?: string }>
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
  const { date, waiting } = await searchParams
  const showWaiting = waiting === '1'
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
  const [{ data: lessons }, { data: termPeriods }, { data: teachersData }, { data: shiftsData }, { data: dailyNote }, { data: makeupData }] = await Promise.all([
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
    supabase.from('teachers').select('id, name').order('name'),
    supabase.from('shifts').select('teacher_id, date, start_time, end_time').eq('date', dateStr),
    supabase.from('daily_notes').select('content').eq('date', dateStr).maybeSingle(),
    supabase.from('makeup_assignments').select('lesson_id, student:students(id, name)').eq('assigned_date', dateStr),
  ])

  // lesson_id -> 振替生徒リスト
  const makeupByLesson = new Map<string, { id: string; name: string }[]>()
  for (const m of (makeupData ?? []) as unknown as { lesson_id: string; student: { id: string; name: string } | null }[]) {
    if (!m.student) continue
    if (!makeupByLesson.has(m.lesson_id)) makeupByLesson.set(m.lesson_id, [])
    makeupByLesson.get(m.lesson_id)!.push(m.student)
  }

  const activeTerm = (termPeriods as TermPeriod[] ?? []).find(
    (t) => t.start_date <= dateStr && t.end_date >= dateStr
  )
  const currentTermType = activeTerm?.type ?? 'regular'

  // 臨時コマ(講習など)は「その日付」だけ表示。通常コマは曜日＋期間区分で表示。
  // （specific_dateで絞らないと、同じ曜日の別日の講習コマが重複表示される）
  const typedLessons = ((lessons as Lesson[]) ?? []).filter((l) =>
    l.lesson_kind === 'temporary'
      ? l.specific_date === dateStr
      : l.term_type === currentTermType
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

  // 待機中の先生計算
  const allTeachers = (teachersData ?? []) as { id: string; name: string }[]
  const dayShifts = (shiftsData ?? []) as { teacher_id: string; date: string; start_time: string; end_time: string }[]

  function shiftCoversSlot(shift: { start_time: string; end_time: string }, slotStart: string, slotEnd: string) {
    return shift.start_time <= slotStart && shift.end_time >= slotEnd
  }

  function getWaitingTeachers(slotStart: string, slotEnd: string, slotLessons: Lesson[]) {
    const busyIds = new Set(slotLessons.map(l => l.teacher_id).filter(Boolean))
    return allTeachers.filter(t =>
      !busyIds.has(t.id) &&
      dayShifts.some(s => s.teacher_id === t.id && shiftCoversSlot(s, slotStart, slotEnd))
    )
  }

  return (
    <div className="print-root bg-white min-h-screen">
      <AutoPrint />
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 6mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          /* ページ全体: A4縦297mm − 上下余白6mm×2 = 285mm（誤差吸収で-2mm） */
          .dpp-page {
            height: 283mm;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
          }

          /* ヘッダー */
          .dpp-header {
            flex-shrink: 0 !important;
            padding-bottom: 1mm !important;
            margin-bottom: 2mm !important;
            border-bottom: 1.5px solid #1E3A5F !important;
          }
          .dpp-header h1 { font-size: 15px !important; line-height: 1.2 !important; margin: 0 !important; }
          .dpp-header p  { font-size: 9px !important; margin: 0 !important; }

          /* コマ一覧: 均等分割 */
          .dpp-slots {
            flex: 1 !important;
            min-height: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 1.5mm !important;
            overflow: hidden !important;
          }

          /* コマ枠: 印刷時のみコマ数に応じた比例配分（flex-basis 0）にする。
             画面表示で basis 0 にすると高さが潰れて何も見えなくなるため print 限定 */
          .dpp-slot {
            min-height: 0 !important;
            flex-basis: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            border: 1px solid #9ca3af !important;
            border-radius: 0 !important;
          }

          /* 連絡事項メモ */
          .dpp-memo {
            flex-shrink: 0 !important;
            margin-top: 2mm !important;
            padding-top: 2mm !important;
            border-top: 1px dashed #d1d5db !important;
          }
          .dpp-memo-label { font-size: 8px !important; font-weight: 700 !important; color: #b45309 !important; }
          .dpp-memo-body  { font-size: 9px !important; color: #374151 !important; white-space: pre-wrap !important; }

          /* コマヘッダー（濃紺） */
          .dpp-slot-hdr {
            flex-shrink: 0 !important;
            padding: 1.5mm 4mm !important;
            gap: 6mm !important;
            background: #1E3A5F !important;
            color: white !important;
            display: flex !important;
            align-items: center !important;
          }
          .dpp-slot-hdr .slot-num  { font-size: 11px !important; font-weight: 700 !important; }
          .dpp-slot-hdr .slot-time { font-size: 14px !important; font-weight: 700 !important; font-family: monospace !important; }

          /* 授業カード行 */
          .dpp-slot-body {
            flex: 1 !important;
            min-height: 0 !important;
            display: flex !important;
            flex-wrap: wrap !important;
            align-content: flex-start !important;
            gap: 1mm !important;
            padding: 1.5mm !important;
            overflow: hidden !important;
          }

          /* 授業カード: コンパクトにしてテキストを大きく */
          .dpp-card {
            flex: none !important;
            width: calc(25% - 1mm) !important;
            min-width: 40mm !important;
            display: flex !important;
            flex-direction: column !important;
            border-radius: 2px !important;
            border-width: 1px !important;
            overflow: hidden !important;
          }
          .dpp-card-booth {
            flex-shrink: 0 !important;
            font-size: 9px !important;
            font-weight: 700 !important;
            padding: 0.5mm 2mm !important;
          }
          .dpp-card-body {
            padding: 1mm 2mm !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 0.3mm !important;
          }
          .dpp-card-teacher { font-size: 13px !important; font-weight: 700 !important; line-height: 1.3 !important; margin: 0 !important; }
          .dpp-card-student { font-size: 11px !important; line-height: 1.4 !important; margin: 0 !important; }
          .dpp-card-subject { font-size: 8px !important; color: #6b7280 !important; }
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
          <Link
            href={`/schedule/print/day?date=${dateStr}&waiting=${showWaiting ? '0' : '1'}`}
            className={[
              'px-3 py-1.5 text-sm rounded-lg border transition-colors',
              showWaiting
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            待機中の先生を{showWaiting ? '非表示' : '表示'}
          </Link>
          <PrintButton label="印刷（縦A4）" />
        </div>
      </div>

      {/* 印刷コンテンツ */}
      <div className="max-w-3xl mx-auto p-6 print:p-0 print:max-w-none">
        {/* 画面プレビュー */}
        <div className="dpp-page">
          {/* ヘッダー */}
          <div className="dpp-header mb-4 pb-3 border-b-2 border-navy">
            <h1 className="text-2xl font-bold text-navy print:text-xl leading-tight">
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
                style={{ flexGrow: Math.max(slot.lessons.length, 1) }}>
                {/* コマヘッダー */}
                <div className="dpp-slot-hdr bg-navy text-white flex items-center gap-6 px-4 py-2.5 print:px-3 print:py-1.5">
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
                        <LessonPosterCard key={lesson.id} lesson={lesson} makeupStudents={makeupByLesson.get(lesson.id) ?? []} />
                      ))
                  ) : (
                    <div className="dpp-empty flex-1 flex items-center justify-center text-gray-300 text-sm print:text-xs">
                      授業なし
                    </div>
                  )}
                  {showWaiting && (() => {
                    const waiting = getWaitingTeachers(slot.start, slot.end, slot.lessons)
                    return waiting.length > 0 ? (
                      <div className="w-full flex flex-wrap gap-1.5 pt-2 mt-1 border-t border-dashed border-blue-200">
                        {waiting.map(t => (
                          <span key={t.id} className="text-xs bg-blue-50 text-blue-600 border border-dashed border-blue-300 px-2 py-0.5 rounded-full print:text-[8px]">
                            {t.name}（待機中）
                          </span>
                        ))}
                      </div>
                    ) : null
                  })()}
                </div>
              </div>
            ))}
          </div>

          {/* 連絡事項メモ（コマ一覧の後） */}
          {dailyNote?.content && (
            <div className="dpp-memo mt-3 pt-2 border-t border-dashed border-gray-300 print:mt-0">
              <p className="dpp-memo-label text-[10px] font-bold text-amber-700">【連絡事項】</p>
              <p className="dpp-memo-body text-xs text-gray-700 whitespace-pre-wrap">{dailyNote.content}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LessonPosterCard({ lesson, makeupStudents = [] }: { lesson: Lesson; makeupStudents?: { id: string; name: string }[] }) {
  const isGroup = lesson.type === 'group'
  const isPS1 = Boolean((lesson as { is_ps1?: boolean }).is_ps1)
  const isPurple = isGroup || isPS1
  const teacher = (lesson as { teacher?: { name: string } }).teacher
  const booth = (lesson as { booth?: { name: string } }).booth
  const students = (lesson.enrollments ?? [])
    .map((e) => e.student)
    .filter((s): s is NonNullable<typeof s> => s != null)

  return (
    <div className={[
      'dpp-card flex-1 flex flex-col rounded-lg border-2 print:rounded overflow-hidden',
      'min-w-[130px] print:min-w-[28mm]',
      isPurple
        ? 'border-purple-400 bg-purple-50'
        : 'border-teal-400 bg-teal-50',
    ].join(' ')}>
      {booth?.name && (
        <div className={[
          'dpp-card-booth text-xs font-bold px-3 py-1 print:px-2 print:py-0.5 border-b flex items-center gap-1',
          isPurple
            ? 'bg-purple-200 border-purple-300 text-purple-800'
            : 'bg-teal-200 border-teal-300 text-teal-800',
        ].join(' ')}>
          {isPS1 && !isGroup && (
            <span className="text-[8px] font-bold px-1 rounded bg-purple-500 text-white">1対1</span>
          )}
          {booth.name}
        </div>
      )}

      <div className="dpp-card-body flex flex-col gap-1 p-3 print:p-2">
        {teacher?.name ? (
          <p className={[
            'dpp-card-teacher font-bold text-lg print:text-sm leading-tight',
            isPurple ? 'text-purple-900' : 'text-teal-900',
          ].join(' ')}>
            {teacher.name}
          </p>
        ) : (
          <p className="text-sm text-gray-400 print:text-xs">担当未設定</p>
        )}

        <div className="space-y-0.5">
          {students.length > 0 ? (
            students.map((s, i) => (
              <p key={i} className="text-sm print:text-[10px] leading-snug text-gray-800">
                {s.name}
                <span className="text-gray-500 ml-1 text-xs print:text-[8px]">（{lesson.subject}）</span>
              </p>
            ))
          ) : makeupStudents.length === 0 ? (
            <p className="text-xs text-gray-400">生徒未登録</p>
          ) : null}
          {makeupStudents.map((m) => (
            <p key={m.id} className="dpp-card-student text-sm print:text-[10px] leading-snug font-bold text-amber-800 bg-amber-100 rounded px-1 -mx-0.5">
              {m.name}
              <span className="ml-1 text-xs print:text-[8px] font-bold text-amber-600">振替</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}
