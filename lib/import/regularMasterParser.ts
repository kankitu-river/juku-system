import * as XLSX from 'xlsx'

export interface ParsedRegularStudent {
  displayName: string // 生徒表記（短縮名）
  subject: string
}

export interface ParsedRegularLesson {
  dayOfWeek: number // 1=月 .. 6=土
  slot: number // 1..3
  isGroup: boolean
  teacherName: string // 講師表記（= DBのteachers.name）
  subject: string
  students: ParsedRegularStudent[]
}

export interface ParsedRegularSchedule {
  lessons: ParsedRegularLesson[]
}

const SHEET = 'マスター'

// 各曜日ブロックの先頭列（席列）。6列ごと: 席/講師/生徒1/教科1/生徒2/教科2
const BLOCKS: { base: number; dow: number }[] = [
  { base: 1, dow: 1 }, // 月
  { base: 7, dow: 2 }, // 火
  { base: 13, dow: 3 }, // 水
  { base: 19, dow: 4 }, // 木
  { base: 25, dow: 5 }, // 金
  { base: 31, dow: 6 }, // 土
]

// 集団授業（土曜）の開始時刻 → コマ番号
const GROUP_START_TO_SLOT: Record<string, number> = {
  '16:30': 1,
  '17:40': 2,
  '18:50': 3,
}

const TIME_RANGE_RE = /(\d{1,2})[：:](\d{2})\s*[～~〜-]/

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(/\s+/g, ' ').trim()
}

export function parseRegularMaster(buffer: ArrayBuffer | Buffer): ParsedRegularSchedule {
  const wb = XLSX.read(buffer, { type: 'buffer', sheets: [SHEET] })
  const ws = wb.Sheets[SHEET]
  if (!ws) throw new Error(`「${SHEET}」シートが見つかりません`)

  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) as unknown[][]

  const lessons: ParsedRegularLesson[] = []
  let slot = 0 // 現在のコマ（A列の時刻マーカーで切り替わる）

  for (let i = 3; i < grid.length; i++) {
    const row = grid[i] ?? []
    const a = cellStr(row[0])
    if (a === '16') slot = 1
    else if (a === '18') slot = 2
    else if (a === '19') slot = 3
    else if (a === '14') slot = 0 // 定期試験時間帯 → 対象外

    for (const { base, dow } of BLOCKS) {
      const teacher = cellStr(row[base + 1])
      const c1 = cellStr(row[base + 2]) // 生徒1（集団行では時刻）
      const sub1 = cellStr(row[base + 3])
      const c2 = cellStr(row[base + 4])
      const sub2 = cellStr(row[base + 5])

      // 集団授業行の判定: 生徒1セルが時刻レンジ（例 16：30～17：30）
      const timeMatch = c1.match(TIME_RANGE_RE)
      if (timeMatch) {
        if (!teacher) continue
        const hhmm = `${parseInt(timeMatch[1], 10)}:${timeMatch[2]}`
        const gslot = GROUP_START_TO_SLOT[hhmm] ?? 0
        if (gslot === 0) continue
        lessons.push({
          dayOfWeek: dow,
          slot: gslot,
          isGroup: true,
          teacherName: teacher,
          subject: sub2 || sub1 || '',
          students: [],
        })
        continue
      }

      // 個別授業行
      if (slot === 0) continue
      if (!teacher) continue
      const students: ParsedRegularStudent[] = []
      if (c1 && c1 !== 'PS1') students.push({ displayName: c1, subject: sub1 })
      if (c2 && c2 !== 'PS1') students.push({ displayName: c2, subject: sub2 })
      if (students.length === 0) continue // 講師のみの行はスキップ

      lessons.push({
        dayOfWeek: dow,
        slot,
        isGroup: false,
        teacherName: teacher,
        subject: students[0].subject || sub1 || sub2 || '',
        students,
      })
    }
  }

  return { lessons }
}
