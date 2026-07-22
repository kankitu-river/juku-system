import * as XLSX from 'xlsx'

export interface ParsedLessonStudent {
  fullName: string   // 生徒氏名（フル）
  subject: string
}

export interface ParsedLesson {
  date: string       // YYYY-MM-DD
  slot: number       // 1..7
  isGroup: boolean
  isPs1: boolean
  teacherName: string // 講師表記（短縮名 = DBのteachers.name）
  subject: string
  students: ParsedLessonStudent[]
}

export interface ParsedSchedule {
  lessons: ParsedLesson[]
  minDate: string
  maxDate: string
}

const SHEET = '講習授業日程'

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function serialToDate(s: number): string {
  // Excelシリアル → YYYY-MM-DD（UTC基準で日付のみ）
  const ms = Math.round((s - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 10)
}

// 生徒ID→氏名、講師ID→表記 のマップを名簿から作る
function buildRosterMaps(wb: XLSX.WorkBook) {
  const studentById = new Map<string, string>()
  const teacherById = new Map<string, string>()
  const sRows = XLSX.utils.sheet_to_json(wb.Sheets['生徒名簿'], { header: 1, blankrows: false, defval: '' }) as unknown[][]
  for (const r of sRows) {
    const id = cellStr(r[0]); const name = cellStr(r[1])
    if (/^\d+$/.test(id) && name) studentById.set(id, name)
  }
  const tRows = XLSX.utils.sheet_to_json(wb.Sheets['講師名簿'], { header: 1, blankrows: false, defval: '' }) as unknown[][]
  for (const r of tRows) {
    const id = cellStr(r[0]); const short = cellStr(r[2]); const full = cellStr(r[1])
    if (/^\d+$/.test(id)) teacherById.set(id, short || full)
  }
  return { studentById, teacherById }
}

export function parseIntensiveSchedule(buffer: ArrayBuffer | Buffer): ParsedSchedule {
  // 講習日程＋名簿の必要シートだけ解析する（他の巨大シートを読むと重いため）
  const wb = XLSX.read(buffer, { type: 'buffer', sheets: [SHEET, '生徒名簿', '講師名簿'] })
  const ws = wb.Sheets[SHEET]
  if (!ws) return { lessons: [], minDate: '', maxDate: '' }

  const { studentById, teacherById } = buildRosterMaps(wb)
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) as unknown[][]

  const lessons: ParsedLesson[] = []
  let currentDate = ''
  const dates: string[] = []

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i]
    const a = row[0]
    if (typeof a === 'number' && a > 40000) {
      const d = serialToDate(a)
      // 日曜（0）は講習コマが無いためスキップする
      currentDate = new Date(d + 'T12:00:00').getDay() === 0 ? '' : d
      if (currentDate) dates.push(currentDate)
    }
    if (!currentDate) continue

    const seat = cellStr(row[2])
    if (!seat || seat === 'Ch') continue // 競合チェック行など

    for (let s = 0; s < 7; s++) {
      const base = 3 + s * 8
      const s1id = cellStr(row[base]);     const s1sub = cellStr(row[base + 1]); const s1name = cellStr(row[base + 2])
      const tid = cellStr(row[base + 3]);  const tname = cellStr(row[base + 4])
      const s2id = cellStr(row[base + 5]); const s2sub = cellStr(row[base + 6]); const s2name = cellStr(row[base + 7])

      const teacherName = (tid && teacherById.get(tid)) || tname
      if (!teacherName) continue

      const rawStudents = [
        { id: s1id, sub: s1sub, name: s1name },
        { id: s2id, sub: s2sub, name: s2name },
      ]
      const students: ParsedLessonStudent[] = []
      for (const rs of rawStudents) {
        if (!rs.id && !rs.name) continue
        const fullName = (rs.id && studentById.get(rs.id)) || rs.name
        if (!fullName) continue
        students.push({ fullName, subject: rs.sub })
      }

      const subjects = [s1sub, s2sub].filter(Boolean)
      const isGroup = seat === '13' || subjects.some((x) => x.startsWith('集'))
      const isPs1 = subjects.some((x) => x === 'PS1')
      const subject = students[0]?.subject || subjects[0] || ''

      // 生徒も科目も無ければスキップ（空セル）
      if (students.length === 0 && !subject) continue

      lessons.push({
        date: currentDate, slot: s + 1, isGroup, isPs1,
        teacherName, subject, students,
      })
    }
  }

  const sorted = [...dates].sort()
  return {
    lessons,
    minDate: sorted[0] ?? '',
    maxDate: sorted[sorted.length - 1] ?? '',
  }
}
