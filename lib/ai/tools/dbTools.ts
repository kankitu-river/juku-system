import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'

export const DB_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_students',
    description: '生徒を名前・学年・科目で検索します。',
    input_schema: {
      type: 'object' as const,
      properties: {
        name_query: { type: 'string', description: '名前の一部（部分一致）' },
        grade: { type: 'string', description: '学年（例: 中1, 高2）' },
        subject: { type: 'string', description: '受講科目（例: 数学）' },
      },
    },
  },
  {
    name: 'search_lessons',
    description: 'コマ（授業）を曜日・担当講師・科目で検索します。',
    input_schema: {
      type: 'object' as const,
      properties: {
        teacher_name: { type: 'string', description: '担当講師名の一部' },
        day_of_week: { type: 'number', description: '曜日 (0=日, 1=月, ..., 6=土)' },
        subject: { type: 'string', description: '科目名の一部' },
      },
    },
  },
  {
    name: 'get_attendance_stats',
    description: '出席率・欠席数の集計を取得します。',
    input_schema: {
      type: 'object' as const,
      properties: {
        student_name: { type: 'string', description: '生徒名の一部（省略で全体）' },
        from_date: { type: 'string', description: '集計開始日 (YYYY-MM-DD)' },
        to_date: { type: 'string', description: '集計終了日 (YYYY-MM-DD)' },
      },
    },
  },
  {
    name: 'get_makeup_credits',
    description: '振替クレジット残数を取得します。',
    input_schema: {
      type: 'object' as const,
      properties: {
        student_name: { type: 'string', description: '生徒名の一部（省略で残数が1以上の全員）' },
      },
    },
  },
  {
    name: 'get_shift_info',
    description: '先生のシフト情報を取得します。',
    input_schema: {
      type: 'object' as const,
      properties: {
        teacher_name: { type: 'string', description: '先生名の一部' },
        from_date: { type: 'string', description: '開始日 (YYYY-MM-DD)' },
        to_date: { type: 'string', description: '終了日 (YYYY-MM-DD)' },
      },
    },
  },
]

type ToolInput = Record<string, unknown>

export async function executeDbTool(
  toolName: string,
  input: ToolInput,
  supabase: SupabaseClient
): Promise<string> {
  try {
    switch (toolName) {
      case 'search_students': {
        let query = supabase.from('students').select('id, name, grade, subjects').limit(20)
        if (input.name_query) query = query.ilike('name', `%${input.name_query}%`)
        if (input.grade) query = query.ilike('grade', `%${input.grade}%`)
        if (input.subject) query = query.contains('subjects', [input.subject])
        const { data, error } = await query
        if (error) return `エラー: ${error.message}`
        if (!data || data.length === 0) return '該当する生徒が見つかりませんでした。'
        return JSON.stringify(data.map((s) => ({
          名前: s.name,
          学年: s.grade,
          科目: (s.subjects as string[] | null)?.join(', ') ?? 'なし',
        })))
      }

      case 'search_lessons': {
        let query = supabase
          .from('lessons')
          .select('id, title, subject, day_of_week, slot_index, type, capacity, teacher:teachers(name)')
          .limit(20)
        if (input.day_of_week !== undefined) query = query.eq('day_of_week', input.day_of_week as number)
        if (input.subject) query = query.ilike('subject', `%${input.subject}%`)
        const { data, error } = await query
        if (error) return `エラー: ${error.message}`
        let rows = (data ?? []) as unknown as Array<{ title: string; subject: string; day_of_week: number; slot_index: number; type: string; capacity: number; teacher: { name: string } | null }>
        if (input.teacher_name) {
          const tq = input.teacher_name as string
          rows = rows.filter((r) => r.teacher?.name?.includes(tq))
        }
        if (rows.length === 0) return '該当するコマが見つかりませんでした。'
        const DOW = ['日', '月', '火', '水', '木', '金', '土']
        return JSON.stringify(rows.map((l) => ({
          タイトル: l.title,
          科目: l.subject,
          曜日: DOW[l.day_of_week],
          コマ: l.slot_index,
          担当: l.teacher?.name ?? 'なし',
          定員: l.capacity,
        })))
      }

      case 'get_attendance_stats': {
        let query = supabase
          .from('attendances')
          .select('status, student:students(name)')
        if (input.from_date) query = query.gte('date', input.from_date as string)
        if (input.to_date) query = query.lte('date', input.to_date as string)
        const { data, error } = await query.limit(500)
        if (error) return `エラー: ${error.message}`
        let rows = (data ?? []) as unknown as Array<{ status: string; student: { name: string } | null }>
        if (input.student_name) {
          const sq = input.student_name as string
          rows = rows.filter((r) => r.student?.name?.includes(sq))
        }
        const total = rows.length
        const absent = rows.filter((r) => r.status === 'absent').length
        const present = rows.filter((r) => r.status === 'present').length
        const makeup = rows.filter((r) => r.status === 'makeup_used').length
        return JSON.stringify({
          合計: total,
          出席: present,
          欠席: absent,
          振替利用: makeup,
          出席率: total > 0 ? `${Math.round((present / total) * 100)}%` : 'データなし',
        })
      }

      case 'get_makeup_credits': {
        const query = supabase
          .from('makeup_credits')
          .select('total_credits, used_credits, student:students(name)')
        const { data, error } = await query.limit(30)
        if (error) return `エラー: ${error.message}`
        let rows = (data ?? []) as unknown as Array<{ total_credits: number; used_credits: number; student: { name: string } | null }>
        if (input.student_name) {
          const sq = input.student_name as string
          rows = rows.filter((r) => r.student?.name?.includes(sq))
        } else {
          rows = rows.filter((r) => r.total_credits - r.used_credits > 0)
        }
        if (rows.length === 0) return '該当する振替残数データが見つかりませんでした。'
        return JSON.stringify(rows.map((c) => ({
          生徒: c.student?.name ?? '不明',
          残数: c.total_credits - c.used_credits,
          合計付与: c.total_credits,
          使用済み: c.used_credits,
        })))
      }

      case 'get_shift_info': {
        let query = supabase
          .from('shifts')
          .select('date, start_time, end_time, teacher:teachers(name)')
          .order('date')
        if (input.from_date) query = query.gte('date', input.from_date as string)
        if (input.to_date) query = query.lte('date', input.to_date as string)
        const { data, error } = await query.limit(50)
        if (error) return `エラー: ${error.message}`
        let rows = (data ?? []) as unknown as Array<{ date: string; start_time: string; end_time: string; teacher: { name: string } | null }>
        if (input.teacher_name) {
          const tq = input.teacher_name as string
          rows = rows.filter((r) => r.teacher?.name?.includes(tq))
        }
        if (rows.length === 0) return '該当するシフトが見つかりませんでした。'
        return JSON.stringify(rows.map((s) => ({
          先生: s.teacher?.name ?? '不明',
          日付: s.date,
          開始: s.start_time,
          終了: s.end_time,
        })))
      }

      default:
        return `未知のツール: ${toolName}`
    }
  } catch (e) {
    return `ツール実行エラー: ${e instanceof Error ? e.message : String(e)}`
  }
}
