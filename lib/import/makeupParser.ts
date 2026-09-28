import * as XLSX from 'xlsx'

export type MakeupStatus = 'pending' | 'scheduled' | 'completed'

export interface ParsedMakeup {
  studentName: string
  receivedDate: string | null   // YYYY-MM-DD
  originalLesson: string        // 授業日時（"夏期講習"等の文字列 or YYYY-MM-DD）
  subject: string
  desiredRaw: string            // 振替希望日時の生テキスト
  scheduledDate: string | null  // best-effort でパースできた決定日
  status: MakeupStatus
  nextTestDate: string
  notes: string
  sourceSheet: string
}

export interface ParsedMakeupResult {
  rows: ParsedMakeup[]
  pendingCount: number
  scheduledCount: number
  completedCount: number
}

const ACTIVE_SHEET = '授業振替'
const DONE_SHEET = '授業振替終了済み'

// 「振替日未定」の塗り色（スケ組みソフトの凡例：オレンジ FFC000 = 未定）
const PENDING_FILL = 'FFC000'

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function serialToDate(s: number): string {
  const ms = Math.round((s - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 10)
}

// 数値ならExcelシリアル日付、文字列ならそのまま返す
function dateOrText(v: unknown): string {
  if (typeof v === 'number' && v > 40000) return serialToDate(v)
  return cellStr(v)
}

function fillRgb(cell: XLSX.CellObject | undefined): string | null {
  const s = (cell as unknown as { s?: { patternType?: string; fgColor?: { rgb?: string } } })?.s
  if (!s || s.patternType === 'none') return null
  return s.fgColor?.rgb ?? null
}

// 振替希望日時テキストから決定日を best-effort で抽出。
// 例: "2024/10/4(金)20：00" / "9/29（火）16：30" / "10/10(木) 18:15"
// 年が無い場合は受付日の年（月が受付より前なら翌年）で補完する。
function parseDesiredDate(raw: string, receivedIso: string | null): string | null {
  const full = raw.match(/(\d{4})[/](\d{1,2})[/](\d{1,2})/)
  if (full) {
    const [, y, m, d] = full
    return `${y}-${String(+m).padStart(2, '0')}-${String(+d).padStart(2, '0')}`
  }
  const md = raw.match(/(?:^|[^\d/])(\d{1,2})[/](\d{1,2})(?![/\d])/)
  if (md && receivedIso) {
    const m = +md[1], d = +md[2]
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    const recY = +receivedIso.slice(0, 4)
    const recM = +receivedIso.slice(5, 7)
    const year = m < recM ? recY + 1 : recY
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

function parseSheet(ws: XLSX.WorkSheet, sheetName: string, done: boolean): ParsedMakeup[] {
  if (!ws || !ws['!ref']) return []
  const range = XLSX.utils.decode_range(ws['!ref'])
  const out: ParsedMakeup[] = []
  // 行0はヘッダー。以降を走査し、生徒氏名(列3)が空の行（凡例・空行）はスキップ
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const at = (c: number) => ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
    const name = cellStr(at(3)?.v)
    if (!name) continue

    const receivedRaw = at(0)?.v
    const receivedDate = typeof receivedRaw === 'number' && receivedRaw > 40000 ? serialToDate(receivedRaw) : null
    const desiredRaw = cellStr(at(4)?.v)

    let status: MakeupStatus
    if (done) {
      status = 'completed'
    } else {
      status = fillRgb(at(3)) === PENDING_FILL ? 'pending' : 'scheduled'
    }

    out.push({
      studentName: name,
      receivedDate,
      originalLesson: dateOrText(at(1)?.v),
      subject: cellStr(at(2)?.v),
      desiredRaw,
      scheduledDate: status === 'pending' ? null : parseDesiredDate(desiredRaw, receivedDate),
      status,
      nextTestDate: cellStr(at(5)?.v),
      notes: cellStr(at(6)?.v),
      sourceSheet: sheetName,
    })
  }
  return out
}

export function parseMakeupWorkbook(buffer: ArrayBuffer | Buffer): ParsedMakeupResult {
  // 塗り色で未定/決定を判定するため cellStyles: true が必須
  const wb = XLSX.read(buffer, { type: 'buffer', cellStyles: true })
  const rows = [
    ...parseSheet(wb.Sheets[ACTIVE_SHEET], ACTIVE_SHEET, false),
    ...parseSheet(wb.Sheets[DONE_SHEET], DONE_SHEET, true),
  ]
  return {
    rows,
    pendingCount: rows.filter((x) => x.status === 'pending').length,
    scheduledCount: rows.filter((x) => x.status === 'scheduled').length,
    completedCount: rows.filter((x) => x.status === 'completed').length,
  }
}
