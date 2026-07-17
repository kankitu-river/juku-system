import type { SupabaseClient } from '@supabase/supabase-js'

export type LessonSnapshot = {
  lesson: Record<string, unknown>
  enrollments: { student_id: string; subject: string | null }[]
}

export async function snapshotLesson(
  supabase: SupabaseClient,
  lessonId: string
): Promise<LessonSnapshot | null> {
  const { data: lesson } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .single()

  if (!lesson) return null

  const { data: enrollments } = await supabase
    .from('lesson_enrollments')
    .select('student_id, subject')
    .eq('lesson_id', lessonId)

  return {
    lesson: lesson as Record<string, unknown>,
    enrollments: (enrollments ?? []).map((e) => ({
      student_id: e.student_id,
      subject: e.subject ?? null,
    })),
  }
}

interface RecordAuditParams {
  recordId: string
  action: 'create' | 'update' | 'delete' | 'undo'
  before: LessonSnapshot | null
  after: LessonSnapshot | null
  undoneLogId?: string
  summary?: string
}

export async function recordAudit(
  supabase: SupabaseClient,
  params: RecordAuditParams
): Promise<string | null> {
  const { data } = await supabase
    .from('audit_logs')
    .insert({
      table_name: 'lessons',
      record_id: params.recordId,
      action: params.action,
      before_snapshot: params.before ?? null,
      after_snapshot: params.after ?? null,
      undone_log_id: params.undoneLogId ?? null,
      summary: params.summary ?? null,
    })
    .select('id')
    .single()

  return data?.id ?? null
}
