export interface ExtractedTask {
  description: string
  assignee: string | null
  dueDate: string | null
}

export interface ParsedMeeting {
  decisions: string[]
  tasks: ExtractedTask[]
  summary: string
}

// タスク行の先頭パターン: ・ - □ TODO:
const TASK_PREFIX_RE = /^(?:[・\-□]|TODO:)\s*/

// @担当者（スペース・括弧以外が続く）
const AT_RE = /@([^\s(（@\n]+)/

// 期限: (7/25) (7月25日) （8/1）
const DATE_RE = /[（(](\d{1,2})[/月](\d{1,2})日?[)）]/

function resolveDate(month: number, day: number): string {
  const now = new Date()
  const year = now.getFullYear()
  const candidate = new Date(year, month - 1, day)
  // 過去日になる場合は翌年
  const resolved = candidate < now
    ? new Date(year + 1, month - 1, day)
    : candidate
  return `${resolved.getFullYear()}-${String(resolved.getMonth() + 1).padStart(2, '0')}-${String(resolved.getDate()).padStart(2, '0')}`
}

function isTaskLine(line: string): boolean {
  return TASK_PREFIX_RE.test(line) || AT_RE.test(line)
}

function extractTask(line: string): ExtractedTask {
  const description = line.replace(TASK_PREFIX_RE, '').trim()

  const atMatch = AT_RE.exec(line)
  const assignee = atMatch ? atMatch[1] : null

  const dateMatch = DATE_RE.exec(line)
  const dueDate = dateMatch
    ? resolveDate(parseInt(dateMatch[1], 10), parseInt(dateMatch[2], 10))
    : null

  return { description, assignee, dueDate }
}

export function parseMeeting(text: string): ParsedMeeting {
  const lines = text.split('\n')
  const decisions: string[] = []
  const tasks: ExtractedTask[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (/^★/.test(line) || /^【決定】/.test(line)) {
      const body = line.replace(/^★\s*/, '').replace(/^【決定】\s*/, '').trim()
      if (body) decisions.push(body)
      continue
    }

    if (isTaskLine(line)) {
      const task = extractTask(line)
      if (task.description) tasks.push(task)
    }
  }

  // サマリー: 先頭から最大3行（決定・タスク行を除く本文）＋件数
  const bodyLines = lines
    .map(l => l.trim())
    .filter(l => l && !/^★/.test(l) && !/^【決定】/.test(l) && !TASK_PREFIX_RE.test(l))
    .slice(0, 3)

  const countParts = [
    decisions.length > 0 ? `決定${decisions.length}件` : '',
    tasks.length > 0 ? `タスク${tasks.length}件` : '',
  ].filter(Boolean).join('・')

  const bodyPart = bodyLines.join(' ')
  const summary = bodyPart
    ? (countParts ? `${bodyPart}　${countParts}` : bodyPart)
    : countParts || 'メモなし'

  return { decisions, tasks, summary }
}
