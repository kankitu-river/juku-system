import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

// 現在の通常コマ（毎週・繰り返し）を「マスター」シート形式のExcelで書き出す。
// 通常授業インポート（既存を消して入れ替え）でそのまま読み戻せる型。

const DAY_LABELS = ['', '月', '火', '水', '木', '金', '土']
const BLOCK_BASE = [1, 7, 13, 19, 25, 31] // 月〜土 の各ブロック先頭列（席）
const SLOT_MARKER: Record<number, string> = { 1: '16', 2: '18', 3: '19' }
const GROUP_TIME: Record<number, string> = {
  1: '16：30～17：30',
  2: '17：40～18：40',
  3: '18：50～19：50',
}

interface Booth {
  teacher: string
  students: { name: string; subject: string }[] // 最大2
}

export async function GET() {
  const supabase = await createClient()
  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('id, type, day_of_week, slot_index, subject, teacher:teachers(name), enrollments:lesson_enrollments(subject, student:students(name, display_name))')
    .eq('term_type', 'regular')
    .is('specific_date', null)

  if (error) return new Response(`エクスポート失敗: ${error.message}`, { status: 500 })

  type Row = {
    type: string; day_of_week: number; slot_index: number; subject: string | null
    teacher: { name: string } | { name: string }[] | null
    enrollments: { subject: string | null; student: { name: string; display_name: string | null } | { name: string; display_name: string | null }[] | null }[] | null
  }
  const rows = (lessons ?? []) as Row[]

  const teacherName = (t: Row['teacher']) => (Array.isArray(t) ? t[0]?.name : t?.name) ?? ''
  const studentName = (s: { name: string; display_name: string | null } | { name: string; display_name: string | null }[] | null) => {
    const o = Array.isArray(s) ? s[0] : s
    return (o?.display_name || o?.name) ?? ''
  }

  // 個別: day -> slot -> Booth[]  /  集団: day -> slot -> teacher/subject
  const individual: Record<number, Record<number, Booth[]>> = {}
  const group: { day: number; slot: number; teacher: string; subject: string }[] = []

  for (const l of rows) {
    const d = l.day_of_week, s = l.slot_index
    if (l.type === 'group') {
      group.push({ day: d, slot: s, teacher: teacherName(l.teacher), subject: l.subject ?? '' })
      continue
    }
    const studs = (l.enrollments ?? []).map((e) => ({ name: studentName(e.student), subject: e.subject ?? '' })).filter((x) => x.name)
    // 生徒2人ずつを1ブースにまとめる（マスターは1ブース最大2名）
    const pairs: Booth[] = []
    if (studs.length === 0) {
      pairs.push({ teacher: teacherName(l.teacher), students: [] })
    } else {
      for (let i = 0; i < studs.length; i += 2) {
        pairs.push({ teacher: teacherName(l.teacher), students: studs.slice(i, i + 2) })
      }
    }
    individual[d] ??= {}
    individual[d][s] ??= []
    individual[d][s].push(...pairs)
  }

  // 各コマの必要行数
  const rowsForSlot = (slot: number) =>
    Math.max(1, ...BLOCK_BASE.map((_, di) => individual[di + 1]?.[slot]?.length ?? 0))

  const WIDTH = 37
  const blank = () => Array(WIDTH).fill('')
  const aoa: (string | number)[][] = []

  // ヘッダー3行（パーサーはindex3から読むため0-2は無視される）
  const h0 = blank(); aoa.push(h0)
  const h1 = blank()
  BLOCK_BASE.forEach((base, di) => { h1[base] = DAY_LABELS[di + 1] })
  aoa.push(h1)
  const h2 = blank()
  BLOCK_BASE.forEach((base) => {
    h2[base] = '席'; h2[base + 1] = '講師'; h2[base + 2] = '生徒１'; h2[base + 3] = '教科'; h2[base + 4] = '生徒２'; h2[base + 5] = '教科'
  })
  aoa.push(h2)

  // 個別: スロットごと
  for (const slot of [1, 2, 3]) {
    const n = rowsForSlot(slot)
    for (let r = 0; r < n; r++) {
      const row = blank()
      if (r === 0) row[0] = SLOT_MARKER[slot]
      BLOCK_BASE.forEach((base, di) => {
        const booth = individual[di + 1]?.[slot]?.[r]
        if (!booth) return
        row[base + 1] = booth.teacher
        if (booth.students[0]) { row[base + 2] = booth.students[0].name; row[base + 3] = booth.students[0].subject }
        if (booth.students[1]) { row[base + 4] = booth.students[1].name; row[base + 5] = booth.students[1].subject }
      })
      aoa.push(row)
    }
  }

  // 集団（土曜）ブロック
  if (group.length > 0) {
    aoa.push(blank())
    const label = blank(); label[BLOCK_BASE[5]] = '集団'; aoa.push(label)
    for (const g of group.sort((a, b) => a.slot - b.slot)) {
      const base = BLOCK_BASE[g.day - 1] ?? BLOCK_BASE[5]
      const row = blank()
      row[base + 1] = g.teacher // 講師
      row[base + 2] = GROUP_TIME[g.slot] ?? '' // 時刻（生徒1位置）
      row[base + 5] = g.subject // 教科（教科2位置）
      aoa.push(row)
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'マスター')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const today = new Date().toISOString().slice(0, 10)
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="schedule-master-${today}.xlsx"`,
    },
  })
}
