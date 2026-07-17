'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { snapshotLesson, recordAudit, type LessonSnapshot } from '@/lib/audit/recorder'
import { validateLessonConflicts } from '@/lib/utils/scheduleValidation'

export async function undoAudit(
  logId: string,
  force = false
): Promise<{ error?: string; requiresConfirmation?: boolean; confirmMessage?: string }> {
  const supabase = await createClient()

  const { data: log } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('id', logId)
    .single()

  if (!log) return { error: '操作ログが見つかりません' }

  const recordId = log.record_id as string

  if (!force) {
    const { data: newer } = await supabase
      .from('audit_logs')
      .select('id')
      .eq('table_name', log.table_name)
      .eq('record_id', recordId)
      .gt('created_at', log.created_at)
      .limit(1)

    if (newer && newer.length > 0) {
      return {
        requiresConfirmation: true,
        confirmMessage: 'このコマはこの操作の後にも変更されています。それでも元に戻しますか？',
      }
    }
  }

  const beforeSnapshot = log.before_snapshot as LessonSnapshot | null
  const currentSnapshot = await snapshotLesson(supabase, recordId)
  const undoSummary = `「${log.summary ?? '操作'}」を取り消し`

  if (!beforeSnapshot) {
    // Restore to "doesn't exist" → delete
    const { error } = await supabase.from('lessons').delete().eq('id', recordId)
    if (error) return { error: error.message }
  } else {
    const { lesson, enrollments } = beforeSnapshot

    if (!currentSnapshot) {
      // Record was deleted → re-insert
      const conflicts = await validateLessonConflicts(supabase, {
        lesson_kind: (lesson.lesson_kind as 'regular' | 'temporary') ?? 'regular',
        day_of_week: lesson.day_of_week as number,
        slot_index: lesson.slot_index as number,
        term_type: (lesson.term_type as 'regular' | 'intensive') ?? 'regular',
        specific_date: lesson.specific_date as string | null,
        teacher_id: lesson.teacher_id as string | null,
        booth_id: lesson.booth_id as string | null,
        student_ids: enrollments.map((e) => e.student_id),
      })
      const errors = conflicts.filter((c) => c.severity === 'error')
      if (errors.length > 0) {
        return { error: `復元できません: ${errors.map((c) => c.message).join(' ')}` }
      }

      const { error } = await supabase.from('lessons').insert({ ...lesson, id: recordId })
      if (error) return { error: error.message }

      if (enrollments.length > 0) {
        await supabase
          .from('lesson_enrollments')
          .insert(enrollments.map((e) => ({ lesson_id: recordId, student_id: e.student_id, subject: e.subject })))
      }
    } else {
      // Record exists → update to before state
      const { error } = await supabase.from('lessons').update(beforeSnapshot.lesson).eq('id', recordId)
      if (error) return { error: error.message }

      await supabase.from('lesson_enrollments').delete().eq('lesson_id', recordId)
      if (enrollments.length > 0) {
        await supabase
          .from('lesson_enrollments')
          .insert(enrollments.map((e) => ({ lesson_id: recordId, student_id: e.student_id, subject: e.subject })))
      }
    }
  }

  const afterSnapshot = await snapshotLesson(supabase, recordId)
  try {
    await recordAudit(supabase, {
      recordId,
      action: 'undo',
      before: currentSnapshot,
      after: afterSnapshot,
      undoneLogId: logId,
      summary: undoSummary,
    })
  } catch (e) {
    console.error('Failed to record undo audit', e)
  }

  revalidatePath('/schedule')
  revalidatePath(`/schedule/${recordId}`)
  revalidatePath('/history')
  return {}
}
