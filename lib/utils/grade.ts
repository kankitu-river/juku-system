const GRADE_ORDER = ['小1','小2','小3','小4','小5','小6','中1','中2','中3','高1','高2','高3']

export function getNextGrade(grade: string): string | null {
  const idx = GRADE_ORDER.indexOf(grade)
  if (idx === -1 || idx === GRADE_ORDER.length - 1) return null
  return GRADE_ORDER[idx + 1]
}

// 3月のみ「新〇年生」表示、それ以外はそのまま返す
export function getDisplayGrade(grade: string, date: Date = new Date()): string {
  if (date.getMonth() + 1 !== 3) return grade
  const next = getNextGrade(grade)
  if (next === null) return grade === '高3' ? '卒業生' : grade
  return `新${next}年生`
}

export { GRADE_ORDER }
