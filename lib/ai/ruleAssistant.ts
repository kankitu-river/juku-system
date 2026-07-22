import type { SupabaseClient } from '@supabase/supabase-js'

// LLMを使わず、決まった質問パターンに実データで答えるルールベースアシスタント。
// 対応: コマ/スケジュール照会・振替残数・出席率・科目別の先生。

const DOW_NAMES = ['日', '月', '火', '水', '木', '金', '土']

const KNOWN_SUBJECTS = [
  '数学', '算数', '英語', '英会話', '国語', '現代文', '古文', '漢文',
  '理科', '物理', '化学', '生物', '地学',
  '社会', '世界史', '日本史', '地理', '公民', '政治経済', '倫理',
  'プログラミング', '小論文',
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// テキストから対象曜日を推定する（コマ照会用）
function detectTargetDow(text: string): { dow: number; label: string } | null {
  const today = new Date()

  if (/今日|本日/.test(text)) {
    return { dow: today.getDay(), label: `今日（${DOW_NAMES[today.getDay()]}曜）` }
  }
  if (/明日/.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 1)
    return { dow: d.getDay(), label: `明日（${DOW_NAMES[d.getDay()]}曜）` }
  }
  if (/明後日/.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 2)
    return { dow: d.getDay(), label: `明後日（${DOW_NAMES[d.getDay()]}曜）` }
  }

  // 「M月D日」または「D日」→ その日付の曜日
  const md = text.match(/(?:(\d{1,2})月)?(\d{1,2})日/)
  if (md) {
    const month = md[1] ? parseInt(md[1], 10) - 1 : today.getMonth()
    const day = parseInt(md[2], 10)
    const d = new Date(today.getFullYear(), month, day)
    if (!isNaN(d.getTime())) {
      return { dow: d.getDay(), label: `${d.getMonth() + 1}月${day}日（${DOW_NAMES[d.getDay()]}曜）` }
    }
  }

  // 「月曜」「火曜日」など
  for (let i = 0; i < DOW_NAMES.length; i++) {
    if (new RegExp(`${DOW_NAMES[i]}曜`).test(text)) {
      return { dow: i, label: `${DOW_NAMES[i]}曜` }
    }
  }
  return null
}

function detectSubject(text: string): string | null {
  // 長い名前から優先して一致させる（「日本史」を「社会」より先に）
  const sorted = [...KNOWN_SUBJECTS].sort((a, b) => b.length - a.length)
  for (const s of sorted) {
    if (text.includes(s)) return s
  }
  return null
}

// ── 各インテントの回答生成 ──────────────────────────────

async function answerLessons(text: string, supabase: SupabaseClient): Promise<string> {
  const target = detectTargetDow(text)
  const subject = detectSubject(text)

  if (target && target.dow === 0) {
    return `${target.label}は日曜日のため、通常コマはありません。`
  }

  let query = supabase
    .from('lessons')
    .select('title, subject, day_of_week, slot_index, type, teacher:teachers(name)')
    .eq('lesson_kind', 'regular')
    .order('slot_index')
    .limit(60)

  if (target) query = query.eq('day_of_week', target.dow)
  if (subject) query = query.ilike('subject', `%${subject}%`)

  const { data, error } = await query
  if (error) return `コマの取得中にエラーが発生しました: ${error.message}`

  const rows = (data ?? []) as unknown as Array<{
    title: string; subject: string; day_of_week: number; slot_index: number
    type: string; teacher: { name: string } | null
  }>

  if (rows.length === 0) {
    const cond = [target?.label, subject].filter(Boolean).join('・')
    return `${cond || '該当条件'}のコマは見つかりませんでした。`
  }

  const header = [target?.label, subject ? `科目「${subject}」` : null]
    .filter(Boolean).join(' / ') || '登録コマ'
  const lines = rows
    .sort((a, b) => a.day_of_week - b.day_of_week || a.slot_index - b.slot_index)
    .map((l) => {
      const dow = target ? '' : `${DOW_NAMES[l.day_of_week]} `
      const kind = l.type === 'group' ? '集団' : '個別'
      const teacher = l.teacher?.name ? `／${l.teacher.name}先生` : ''
      const subj = l.subject ? `・${l.subject}` : ''
      return `・${dow}第${l.slot_index}コマ [${kind}] ${l.title}${subj}${teacher}`
    })

  return `【${header}】${rows.length}件\n${lines.join('\n')}`
}

async function answerMakeupCredits(text: string, supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('makeup_credits')
    .select('total_credits, used_credits, student:students(name, grade)')
    .limit(200)
  if (error) return `振替残数の取得中にエラーが発生しました: ${error.message}`

  let rows = (data ?? []) as unknown as Array<{
    total_credits: number; used_credits: number; student: { name: string; grade: string } | null
  }>

  // 名前指定があれば絞り込み、なければ残数1以上のみ
  const nameMatch = text.match(/([一-龠ぁ-んァ-ヶА-я]{2,})(?:さん|くん|君|ちゃん)?の振替/)
  if (nameMatch) {
    rows = rows.filter((r) => r.student?.name?.includes(nameMatch[1]))
  } else {
    rows = rows.filter((r) => r.total_credits - r.used_credits > 0)
  }

  if (rows.length === 0) return '振替残数が残っている生徒はいません。'

  rows.sort((a, b) => (b.total_credits - b.used_credits) - (a.total_credits - a.used_credits))
  const lines = rows.map((r) => {
    const remain = r.total_credits - r.used_credits
    const grade = r.student?.grade ? `（${r.student.grade}）` : ''
    return `・${r.student?.name ?? '不明'}${grade}：残り${remain}回`
  })
  return `【振替残数がある生徒】${rows.length}名\n${lines.join('\n')}`
}

async function answerAttendance(text: string, supabase: SupabaseClient): Promise<string> {
  const today = new Date()
  let from: string | null = null
  let to: string | null = null
  let periodLabel = '全期間'

  if (/今月/.test(text)) {
    from = toDateStr(new Date(today.getFullYear(), today.getMonth(), 1))
    to = toDateStr(today)
    periodLabel = '今月'
  } else if (/先月/.test(text)) {
    from = toDateStr(new Date(today.getFullYear(), today.getMonth() - 1, 1))
    to = toDateStr(new Date(today.getFullYear(), today.getMonth(), 0))
    periodLabel = '先月'
  } else if (/今週/.test(text)) {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay())
    from = toDateStr(start)
    to = toDateStr(today)
    periodLabel = '今週'
  }

  let query = supabase.from('attendances').select('status, student:students(name)')
  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)
  const { data, error } = await query.limit(2000)
  if (error) return `出欠の取得中にエラーが発生しました: ${error.message}`

  let rows = (data ?? []) as unknown as Array<{ status: string; student: { name: string } | null }>

  const nameMatch = text.match(/([一-龠ぁ-んァ-ヶ]{2,})(?:さん|くん|君|ちゃん)の/)
  let nameLabel = ''
  if (nameMatch) {
    rows = rows.filter((r) => r.student?.name?.includes(nameMatch[1]))
    nameLabel = `${nameMatch[1]}さんの`
  }

  const total = rows.length
  if (total === 0) return `${periodLabel}の${nameLabel}出欠データはありません。`
  const present = rows.filter((r) => r.status === 'present').length
  const absent = rows.filter((r) => r.status === 'absent').length
  const makeup = rows.filter((r) => r.status === 'makeup_used').length
  const rate = Math.round((present / total) * 100)

  return `【${periodLabel}の${nameLabel}出席状況】\n・出席率：${rate}%\n・出席：${present}件\n・欠席：${absent}件\n・振替利用：${makeup}件\n・合計：${total}件`
}

async function answerTeachersBySubject(text: string, supabase: SupabaseClient): Promise<string> {
  const subject = detectSubject(text)
  if (!subject) {
    return '科目名が読み取れませんでした。例:「数学を教えている先生は？」のように科目を入れてください。'
  }
  const { data, error } = await supabase
    .from('teachers')
    .select('name, subjects, grade_levels')
    .limit(100)
  if (error) return `先生の取得中にエラーが発生しました: ${error.message}`

  const rows = (data ?? []) as Array<{ name: string; subjects: string[] | null; grade_levels: string[] | null }>
  const matched = rows.filter((t) => (t.subjects ?? []).some((s) => s.includes(subject) || subject.includes(s)))

  if (matched.length === 0) return `「${subject}」を担当できる先生は登録されていません。`
  const lines = matched.map((t) => {
    const grades = (t.grade_levels ?? []).length > 0 ? `（得意学年: ${t.grade_levels!.join('・')}）` : ''
    return `・${t.name}先生${grades}`
  })
  return `【「${subject}」を教えられる先生】${matched.length}名\n${lines.join('\n')}`
}

// ── メインルーター ──────────────────────────────

const HELP = `次のような質問に答えられます（LLMは使わず実データから回答します）：
・「今日のコマ一覧」「月曜のスケジュール」「15日の授業」
・「数学のコマを見せて」「英語を教えている先生は？」
・「振替残数がある生徒を教えて」「〇〇さんの振替」
・「今月の出席率は？」「先月の出席状況」`

export async function answerQuestion(text: string, supabase: SupabaseClient): Promise<string> {
  const t = text.trim()
  if (!t) return HELP

  // 振替
  if (/振替|ふりかえ|振り替え/.test(t)) {
    return answerMakeupCredits(t, supabase)
  }
  // 出席・欠席・出席率
  if (/出席|欠席|出欠/.test(t)) {
    return answerAttendance(t, supabase)
  }
  // 科目別の先生（「先生」「講師」「教え」「担当」＋科目）
  if (/(先生|講師|教え|担当)/.test(t) && detectSubject(t)) {
    return answerTeachersBySubject(t, supabase)
  }
  // コマ・スケジュール・授業
  if (/コマ|授業|スケジュール|予定|時間割/.test(t) || detectTargetDow(t) || detectSubject(t)) {
    return answerLessons(t, supabase)
  }

  return `質問の意図を読み取れませんでした。\n\n${HELP}`
}
