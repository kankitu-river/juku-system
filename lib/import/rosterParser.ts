import * as XLSX from 'xlsx'

export interface ParsedTeacher {
  name: string        // 講師表記（短縮名）— DBのteachers.nameはこの短縮名を使用
  fullName: string    // 講師氏名（フルネーム）
}

export interface ParsedStudent {
  name: string        // 生徒氏名（フルネーム）
  displayName: string // 生徒表記（短縮名）
  grade: string       // 学年（例: 小4）
  furigana: string    // ふりがな（全角カナに変換）
  isTrial: boolean    // 体験授業かどうか
}

export interface ParsedRoster {
  teachers: ParsedTeacher[]
  students: ParsedStudent[]
}

// 半角カナ → 全角カナ変換
const HANKAKU = 'ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟｰ '
const ZENKAKU = 'ヲァィゥェォャュョッアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン゛゜ー　'

function toZenkakuKana(s: string): string {
  if (!s) return ''
  let out = ''
  for (const ch of s) {
    const i = HANKAKU.indexOf(ch)
    out += i >= 0 ? ZENKAKU[i] : ch
  }
  // 濁点・半濁点を合成（ｶﾞ→ガ）
  return out
    .normalize('NFKC')
    .trim()
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

// シートを配列の配列(AOA)にする
function sheetToRows(wb: XLSX.WorkBook, sheetName: string): unknown[][] {
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) as unknown[][]
}

export function parseRoster(buffer: ArrayBuffer | Buffer): ParsedRoster {
  // 名簿の2シートだけ解析する（巨大な「講習授業日程」を読むと重く、サーバーが落ちるため）
  const wb = XLSX.read(buffer, { type: 'buffer', sheets: ['講師名簿', '生徒名簿'] })

  // ── 講師名簿 ──
  const teachers: ParsedTeacher[] = []
  const teacherRows = sheetToRows(wb, '講師名簿')
  for (const row of teacherRows) {
    const id = cellStr(row[0])           // A: 講師ID
    const fullName = cellStr(row[1])     // B: 講師氏名
    const short = cellStr(row[2])        // C: 講師表記
    if (!id || id.includes('講師')) continue   // ヘッダー行スキップ
    if (!fullName && !short) continue
    const name = short || fullName
    teachers.push({ name, fullName: fullName || short })
  }

  // ── 生徒名簿 ──
  const students: ParsedStudent[] = []
  const studentRows = sheetToRows(wb, '生徒名簿')
  for (const row of studentRows) {
    const id = cellStr(row[0])           // A: 生徒ID
    const name = cellStr(row[1])         // B: 生徒氏名
    const displayName = cellStr(row[2])  // C: 生徒表記
    const grade = cellStr(row[3])        // D: 学年
    const furigana = toZenkakuKana(cellStr(row[4])) // E: ﾌﾘｶﾞﾅ
    if (!id || id.includes('生徒')) continue    // ヘッダー行スキップ
    if (!name) continue
    const isTrial = name.includes('体験')
    students.push({ name, displayName, grade, furigana, isTrial })
  }

  return { teachers, students }
}
