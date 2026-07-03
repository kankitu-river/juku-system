// JST基準の日付・時刻ユーティリティ
// Vercel のサーバーは UTC で動くため、new Date() や toISOString() をそのまま使うと
// 日本時間の朝9時までは「前日」扱いになる。日付判定は必ずここを経由すること。

const JST = 'Asia/Tokyo'

// 今日の日付を 'YYYY-MM-DD' で返す（JST基準）
export function getJstTodayStr(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: JST }).format(new Date())
}

// 現在時刻を 'HH:MM' で返す（JST基準）
export function getJstTimeStr(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
}

// JSTの「今」を表す Date（getDay() 等のローカルフィールドがJSTの値になる）
export function getJstNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: JST }))
}

// JSTの今日の曜日（0=日曜）
export function getJstDayOfWeek(): number {
  return getJstNow().getDay()
}

// Date のローカルフィールドを 'YYYY-MM-DD' に整形（既存の toDateStr 群の共通化）
export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
