export interface ParsedAvailability {
  available_days: number[]        // 1=月〜6=土, 0=日
  time_preference: 'morning' | 'afternoon' | 'evening' | null
  confidence: 'high' | 'low'
  notes: string
}

// 出力時のソート順: 月→火→水→木→金→土→日
const SORT_ORDER = [1, 2, 3, 4, 5, 6, 0]

const DAY_TO_IDX: Record<string, number> = {
  '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6, '日': 0,
}

// 「平日」「今日」など 日 を含む複合語を除去してから個別曜日をマッチする
function sanitize(text: string): string {
  return text
    .replace(/平日/g, '〓')
    .replace(/今日/g, '〓')
    .replace(/昨日/g, '〓')
    .replace(/明日/g, '〓')
    .replace(/毎日/g, '〓')
    .replace(/週末/g, '〓')
}

function findPositiveDays(text: string): Set<number> {
  const days = new Set<number>()

  if (/平日/.test(text)) [1, 2, 3, 4, 5].forEach(d => days.add(d))
  if (/週末/.test(text)) [0, 6].forEach(d => days.add(d))

  const cleaned = sanitize(text)

  // 範囲: 月〜木 / 火ー金 / 水から土
  const rangeRe = /([月火水木金土日])(?:曜(?:日)?)?(?:[〜～ー\-]|から)([月火水木金土日])(?:曜(?:日)?)?/g
  let m: RegExpExecArray | null
  while ((m = rangeRe.exec(cleaned)) !== null) {
    const si = SORT_ORDER.indexOf(DAY_TO_IDX[m[1]])
    const ei = SORT_ORDER.indexOf(DAY_TO_IDX[m[2]])
    if (si >= 0 && ei >= 0 && si <= ei) {
      SORT_ORDER.slice(si, ei + 1).forEach(d => days.add(d))
    }
  }

  // 個別曜日
  for (const [kanji, idx] of Object.entries(DAY_TO_IDX)) {
    if (new RegExp(`${kanji}(?:曜(?:日)?)?`).test(cleaned)) days.add(idx)
  }

  return days
}

// 否定マーカーの前 20 文字を取り出し、その中の曜日を否定対象とする。
// ただし「OKですが〜はNG」のように肯定表現が途中にある場合は、
// 最後の肯定表現より後の曜日のみを否定対象とする。
const NEG_MARKER_RE = /以外|NG|ng|無理|不可|ダメ|だめ|出られない|来られない|行けない|難しい|×/g
const POS_BREAK_RE = /OK|ok|大丈夫|来られ|出られ|行け|可能/g

function findNegativeDays(text: string): Set<number> {
  const days = new Set<number>()
  const cleaned = sanitize(text)

  NEG_MARKER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NEG_MARKER_RE.exec(cleaned)) !== null) {
    const start = Math.max(0, m.index - 20)
    const segment = cleaned.slice(start, m.index)

    // 肯定表現が含まれる場合は、その最後の出現より後だけを否定範囲とする
    let lastPosEnd = -1
    POS_BREAK_RE.lastIndex = 0
    let pm: RegExpExecArray | null
    while ((pm = POS_BREAK_RE.exec(segment)) !== null) {
      lastPosEnd = pm.index + pm[0].length
    }
    const effectiveSegment = lastPosEnd >= 0 ? segment.slice(lastPosEnd) : segment

    for (const [kanji, idx] of Object.entries(DAY_TO_IDX)) {
      if (new RegExp(`${kanji}(?:曜(?:日)?)?`).test(effectiveSegment)) days.add(idx)
    }
  }

  return days
}

const TIME_DICT: [RegExp, ParsedAvailability['time_preference']][] = [
  [/午前|朝/, 'morning'],
  [/午後|昼/, 'afternoon'],
  [/夕方|夜|(1[6-9]|2[0-2])時(?:以降|から)?|遅め/, 'evening'],
]

export function parseAvailability(text: string): ParsedAvailability {
  const positive = findPositiveDays(text)
  const negative = findNegativeDays(text)

  // 否定は肯定より後に適用
  negative.forEach(d => positive.delete(d))

  const available_days = [...positive].sort(
    (a, b) => SORT_ORDER.indexOf(a) - SORT_ORDER.indexOf(b)
  )

  let time_preference: ParsedAvailability['time_preference'] = null
  for (const [re, pref] of TIME_DICT) {
    if (re.test(text)) time_preference = pref
  }

  return {
    available_days,
    time_preference,
    confidence: available_days.length > 0 ? 'high' : 'low',
    notes: text,
  }
}
