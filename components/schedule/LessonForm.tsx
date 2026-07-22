'use client'

import { useState, useTransition, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { UndoToast } from '@/components/ui/UndoToast'
import type { Lesson, Teacher, Booth, Student, TermType, LessonType, LessonKind } from '@/types'
import {
  DAYS_OF_WEEK,
  SUBJECTS,
  getSlotsForLesson,
  type IntensiveSlotLimits,
} from '@/lib/constants/timeSlots'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { getDisplayGrade } from '@/lib/utils/grade'

interface LessonFormProps {
  lesson?: Lesson
  teachers: Teacher[]
  booths: Booth[]
  students: Student[]
  enrolledStudentIds?: string[]
  enrolledStudentSubjects?: Record<string, string>
  intensiveSlotLimits?: IntensiveSlotLimits | null
  closureDates?: string[]
  upcomingEvents?: { title: string; start_at: string; end_at: string }[]
  onSave: (data: LessonFormData) => Promise<{ error?: string; boothWarning?: string; auditLogId?: string }>
  onSaveRepeating?: (data: LessonFormData, until: string) => Promise<{ count?: number; error?: string }>
  onDelete?: () => Promise<{ error?: string; auditLogId?: string }>
  onGetImpact?: () => Promise<{ affectedStudents: { id: string; name: string; hasPendingCredits: boolean }[]; lessonInfo: unknown }>
}

export interface LessonFormData {
  type: LessonType
  lesson_kind: LessonKind
  specific_date: string
  subject: string
  teacher_id: string
  day_of_week: number
  slot_index: number
  term_type: TermType
  booth_id: string
  capacity: number
  is_ps1: boolean
  notes: string
  student_ids: string[]
  student_subjects: Record<string, string>  // student_id -> subject
  bypassBoothWarning?: boolean
}

const DAY_NAMES: Record<number, string> = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' }

function dowFromDate(dateStr: string): number {
  if (!dateStr) return 1
  const d = new Date(dateStr)
  const js = d.getDay()
  return js === 0 ? 7 : js
}

export function LessonForm({ lesson, teachers, booths, students, enrolledStudentIds = [], enrolledStudentSubjects = {}, intensiveSlotLimits, closureDates = [], upcomingEvents = [], onSave, onSaveRepeating, onDelete, onGetImpact }: LessonFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const [error, setError] = useState<string>()
  const [undoToast, setUndoToast] = useState<{ id: string; message: string; navTarget: string } | null>(null)
  type ImpactStudents = { id: string; name: string; hasPendingCredits: boolean }[]
  const [deleteImpact, setDeleteImpact] = useState<null | 'loading' | ImpactStudents>(null)
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [repeatUntil, setRepeatUntil] = useState('')

  const [formData, setFormData] = useState<LessonFormData>({
    type: lesson?.type ?? 'individual',
    lesson_kind: lesson?.lesson_kind ?? 'regular',
    specific_date: lesson?.specific_date ?? '',
    subject: lesson?.subject ?? '',
    teacher_id: lesson?.teacher_id ?? '',
    day_of_week: lesson?.day_of_week ?? 1,
    slot_index: lesson?.slot_index ?? 1,
    term_type: lesson?.term_type ?? 'regular',
    booth_id: lesson?.booth_id ?? '',
    capacity: lesson?.capacity ?? (lesson?.type === 'group' ? 1 : 2),
    is_ps1: lesson?.is_ps1 ?? false,
    notes: lesson?.notes ?? '',
    student_ids: enrolledStudentIds,
    student_subjects: enrolledStudentSubjects,
  })

  const isTemporary = formData.lesson_kind === 'temporary'
  const effectiveDow = isTemporary ? dowFromDate(formData.specific_date) : formData.day_of_week
  const slots = getSlotsForLesson(formData.type, effectiveDow, formData.term_type, intensiveSlotLimits)

  const [studentSort, setStudentSort] = useState<'name' | 'grade' | 'subject' | 'selected'>('name')

  // フィルター済み生徒リスト
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase()
    return students.filter((s) =>
      !q || s.name.toLowerCase().includes(q) || s.grade.toLowerCase().includes(q)
    )
  }, [students, studentSearch])

  // 並び替え
  const sortedStudents = useMemo(() => {
    return [...filteredStudents].sort((a, b) => {
      if (studentSort === 'selected') {
        const aS = formData.student_ids.includes(a.id) ? 0 : 1
        const bS = formData.student_ids.includes(b.id) ? 0 : 1
        return aS - bS || a.name.localeCompare(b.name, 'ja')
      }
      if (studentSort === 'subject') {
        return a.name.localeCompare(b.name, 'ja')
      }
      if (studentSort === 'grade') {
        return a.grade.localeCompare(b.grade, 'ja') || a.name.localeCompare(b.name, 'ja')
      }
      return a.name.localeCompare(b.name, 'ja')
    })
  }, [filteredStudents, formData.subject, formData.student_ids, studentSort])

  function toggleStudent(id: string) {
    setFormData((prev) => {
      const isSelected = prev.student_ids.includes(id)
      const newIds = isSelected ? prev.student_ids.filter((s) => s !== id) : [...prev.student_ids, id]
      const newSubjects = { ...prev.student_subjects }
      if (!isSelected && !newSubjects[id]) {
        newSubjects[id] = ''
      }
      if (isSelected) delete newSubjects[id]
      return { ...prev, student_ids: newIds, student_subjects: newSubjects }
    })
  }

  function setStudentSubject(studentId: string, subject: string) {
    setFormData((prev) => ({
      ...prev,
      student_subjects: { ...prev.student_subjects, [studentId]: subject },
    }))
  }

  function handleKindChange(kind: LessonKind) {
    setFormData((prev) => ({ ...prev, lesson_kind: kind }))
  }

  function handleDayOrTermChange(field: 'day_of_week' | 'term_type', value: number | string) {
    const next = { ...formData, [field]: value }
    const dow = isTemporary ? dowFromDate(next.specific_date) : (next.day_of_week as number)
    const nextSlots = getSlotsForLesson(next.type, dow, next.term_type)
    const validIndices = nextSlots.map((s) => s.index)
    setFormData({ ...next, slot_index: validIndices.includes(next.slot_index) ? next.slot_index : nextSlots[0].index })
  }

  function handleDateChange(dateStr: string) {
    const dow = dowFromDate(dateStr)
    const nextSlots = getSlotsForLesson(formData.type, dow, formData.term_type)
    const validIndices = nextSlots.map((s) => s.index)
    setFormData((prev) => ({
      ...prev,
      specific_date: dateStr,
      day_of_week: dow,
      slot_index: validIndices.includes(prev.slot_index) ? prev.slot_index : nextSlots[0]?.index ?? 1,
    }))
  }

  function handleTypeChange(type: LessonType) {
    const dow = isTemporary ? dowFromDate(formData.specific_date) : formData.day_of_week
    const nextSlots = getSlotsForLesson(type, dow, formData.term_type)
    const validIndices = nextSlots.map((s) => s.index)
    const defaultCapacity = type === 'individual' ? 2 : formData.capacity
    setFormData({ ...formData, type, capacity: defaultCapacity, slot_index: validIndices.includes(formData.slot_index) ? formData.slot_index : nextSlots[0].index })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isTemporary && !formData.specific_date) { setError('日付を入力してください'); return }
    if (isTemporary && repeat && !repeatUntil) { setError('繰り返しの終了日を入力してください'); return }
    if (formData.term_type === 'intensive' && !formData.subject) {
      setError('講習コマには科目を設定してください（講習割り振りで科目ごとにコマを探すため）'); return
    }
    if (formData.student_ids.length > formData.capacity) {
      setError(`定員（${formData.capacity}名）より多い生徒が選択されています`); return
    }
    setError(undefined)
    const payload = {
      ...formData,
      day_of_week: isTemporary ? dowFromDate(formData.specific_date) : formData.day_of_week,
      specific_date: isTemporary ? formData.specific_date : '',
    }
    // 講習コマは講習割り振りに戻す（週間カレンダーは通常期間の週だと講習コマが見えないため）
    const afterSave = formData.term_type === 'intensive' ? '/schedule/intensive' : '/schedule'
    startTransition(async () => {
      if (isTemporary && repeat && onSaveRepeating) {
        const result = await onSaveRepeating(payload, repeatUntil)
        if (result.error) { setError(result.error) }
        else { router.push(afterSave) }
      } else {
        const result = await onSave(payload)
        if (result.boothWarning) {
          if (!confirm(`${result.boothWarning}\n\nこのまま保存しますか？`)) return
          const result2 = await onSave({ ...payload, bypassBoothWarning: true })
          if (result2.error) { setError(result2.error) }
          else { showUndoToast(result2.auditLogId, lesson ? 'コマを更新しました' : 'コマを作成しました', afterSave) }
        } else if (result.error) {
          setError(result.error)
        } else {
          showUndoToast(result.auditLogId, lesson ? 'コマを更新しました' : 'コマを作成しました', afterSave)
        }
      }
    })
  }

  function showUndoToast(auditLogId: string | undefined, message: string, navTarget: string) {
    if (!auditLogId) { router.push(navTarget); return }
    if (navTimerRef.current) clearTimeout(navTimerRef.current)
    setUndoToast({ id: auditLogId, message, navTarget })
    navTimerRef.current = setTimeout(() => {
      setUndoToast(null)
      router.push(navTarget)
    }, 5000)
  }

  async function handleDelete() {
    if (!onDelete) return
    setError(undefined)

    if (onGetImpact) {
      setDeleteImpact('loading')
      try {
        const impact = await onGetImpact()
        setDeleteImpact(impact.affectedStudents)
      } catch {
        setDeleteImpact([])
      }
    } else {
      if (!confirm('このコマを削除しますか？')) return
      execDelete()
    }
  }

  function execDelete() {
    if (!onDelete) return
    startDeleting(async () => {
      const result = await onDelete()
      if (result.error) { setError(result.error) }
      else { showUndoToast(result.auditLogId, 'コマを削除しました', '/schedule') }
    })
  }

  const selectedCount = formData.student_ids.length

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {/* コマ種別 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">コマ種別</label>
        <div className="flex gap-3">
          {(['regular', 'temporary'] as LessonKind[]).map((k) => (
            <button key={k} type="button" onClick={() => handleKindChange(k)}
              className={[
                'flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all text-left',
                formData.lesson_kind === k
                  ? k === 'regular' ? 'border-navy bg-blue-50 dark:bg-blue-950/40 text-navy dark:text-blue-300' : 'border-orange-400 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-300',
              ].join(' ')}
            >
              <span className="text-lg">{k === 'regular' ? '📅' : '⚡'}</span>
              <div>
                <p className="font-semibold">{k === 'regular' ? '通常コマ' : '臨時コマ'}</p>
                <p className="text-xs opacity-70 font-normal">{k === 'regular' ? '毎週固定で繰り返す' : '特定の日付のみ1回'}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 授業形式 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">授業形式 <span className="text-red-500">*</span></label>
          <select value={formData.type} onChange={(e) => handleTypeChange(e.target.value as LessonType)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy">
            <option value="individual">個別指導</option>
            <option value="group">集団授業</option>
          </select>
        </div>

        {/* 日付 or 曜日 */}
        {isTemporary ? (
          <div className="md:col-span-2 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">開催日 <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-3">
                <input type="date" required value={formData.specific_date} onChange={(e) => handleDateChange(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                {formData.specific_date && (
                  <span className="text-sm text-gray-600 dark:text-gray-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 px-3 py-1.5 rounded-lg">
                    {DAY_NAMES[dowFromDate(formData.specific_date)] ?? ''}曜日
                  </span>
                )}
              </div>
              {/* 休校日・イベント衝突警告 */}
              {formData.specific_date && closureDates.includes(formData.specific_date) && (
                <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 mt-2">
                  ⚠ この日は休校日に設定されています（登録は可能です）
                </p>
              )}
              {formData.specific_date && upcomingEvents
                .filter((ev) => ev.start_at.slice(0, 10) <= formData.specific_date && formData.specific_date <= ev.end_at.slice(0, 10))
                .map((ev) => (
                  <p key={ev.title} className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg px-3 py-2 mt-2">
                    ℹ この日は「{ev.title}」があります（登録は可能です）
                  </p>
                ))}
            </div>
            {onSaveRepeating && (
              <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 rounded-lg">
                <input
                  type="checkbox"
                  id="repeat"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                  className="mt-0.5 rounded text-orange-500"
                />
                <div className="flex-1">
                  <label htmlFor="repeat" className="text-sm font-medium text-orange-800 dark:text-orange-200 cursor-pointer">
                    毎週繰り返す
                  </label>
                  {repeat && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-orange-700 dark:text-orange-300">終了日：</span>
                      <input
                        type="date"
                        value={repeatUntil}
                        min={formData.specific_date}
                        onChange={(e) => setRepeatUntil(e.target.value)}
                        className="border border-orange-300 dark:border-orange-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">曜日</label>
            <select value={formData.day_of_week} onChange={(e) => handleDayOrTermChange('day_of_week', Number(e.target.value))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy">
              {DAYS_OF_WEEK.map((d) => <option key={d.value} value={d.value}>{d.label}曜日</option>)}
            </select>
          </div>
        )}

        {/* 期間区分 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">期間区分</label>
          <select value={formData.term_type} onChange={(e) => handleDayOrTermChange('term_type', e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy">
            <option value="regular">通常期間</option>
            <option value="intensive">講習期間</option>
          </select>
        </div>

        {/* 科目 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            科目
            {formData.term_type === 'intensive'
              ? <span className="text-red-500"> *</span>
              : <span className="ml-1.5 text-xs text-gray-400 font-normal">任意</span>}
          </label>
          <select value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy">
            <option value="">— 未設定 —</option>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {formData.term_type === 'intensive' && (
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">講習コマは科目が必須です（講習割り振り・自動割り振りの検索キーになります）</p>
          )}
        </div>

        {/* 時間帯スロット */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">時間帯スロット</label>
          <select value={formData.slot_index} onChange={(e) => setFormData({ ...formData, slot_index: Number(e.target.value) })}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy">
            {slots.map((slot) => (
              <option key={slot.index} value={slot.index}>第{slot.index}コマ（{slot.start}〜{slot.end}）</option>
            ))}
          </select>
        </div>

        {/* 担当講師 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">担当講師</label>
          <select value={formData.teacher_id} onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy">
            <option value="">— 未割り当て —</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* ブース */}
        {formData.type === 'individual' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ブース</label>
            <select value={formData.booth_id} onChange={(e) => setFormData({ ...formData, booth_id: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy">
              <option value="">— 未割り当て —</option>
              {booths.filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        {/* 定員 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">定員</label>
          <input type="number" min={1} max={100} value={formData.capacity}
            onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy" />
        </div>

        {/* PS1 チェックボックス */}
        {formData.type === 'individual' && (
          <div className="md:col-span-2">
            <label className={[
              'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
              formData.is_ps1
                ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800'
                : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700',
            ].join(' ')}>
              <input
                type="checkbox"
                checked={formData.is_ps1}
                onChange={(e) => setFormData({
                  ...formData,
                  is_ps1: e.target.checked,
                  capacity: e.target.checked ? 1 : 2,
                })}
                className="mt-0.5 rounded accent-purple-600"
              />
              <div>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">PS1授業（1対1）</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  チェックすると定員が1名に固定され、ブース管理画面で隣のブースに他の先生を入れられなくなります
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* メモ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          メモ
          <span className="ml-1.5 text-xs text-gray-400 font-normal">任意・当日の連絡事項など</span>
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="例：今日は模試返却、テキストp.30〜"
          rows={2}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy resize-none"
        />
      </div>

      {/* 生徒選択 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {/* 現在の受講者サマリー */}
        {formData.student_ids.length > 0 && (
          <div className="px-4 py-2.5 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-100">
            <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-300 mb-1.5">現在の受講者</p>
            <div className="flex flex-wrap gap-1.5">
              {students
                .filter((s) => formData.student_ids.includes(s.id))
                .map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1 text-xs bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full">
                    {s.name}
                    <span className="text-[10px] text-blue-400">{getDisplayGrade(s.grade)}</span>
                  </span>
                ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">受講生徒</span>
            {selectedCount > 0 && (
              <span className="text-xs bg-navy text-white px-2 py-0.5 rounded-full font-bold">
                {selectedCount}/{formData.capacity}名
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {(['name', 'grade', 'subject', 'selected'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStudentSort(s)}
                className={[
                  'px-2 py-1 text-[10px] rounded border transition-colors',
                  studentSort === s
                    ? 'bg-navy text-white border-navy'
                    : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50',
                ].join(' ')}
              >
                {s === 'name' ? '名前' : s === 'grade' ? '学年' : s === 'subject' ? '科目一致' : '選択済み'}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="名前・学年で検索"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-navy"
          />
        </div>

        {students.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">生徒が登録されていません</div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700 max-h-56 overflow-y-auto">
            {sortedStudents.map((student) => {
              const isSelected = formData.student_ids.includes(student.id)
              const subjectMatch = formData.subject && student.subjects.includes(formData.subject)
              const isOver = !isSelected && selectedCount >= formData.capacity
              return (
                <div
                  key={student.id}
                  className={[
                    'px-4 py-2 transition-colors',
                    isSelected ? 'bg-blue-50 dark:bg-blue-950/40' : isOver ? 'opacity-40' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                  ].join(' ')}
                >
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isOver}
                      onChange={() => toggleStudent(student.id)}
                      className="rounded text-navy dark:text-blue-300"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{student.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{getDisplayGrade(student.grade)}</span>
                    </div>
                    {!isSelected && subjectMatch && (
                      <span className="text-[10px] bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        科目一致
                      </span>
                    )}
                  </label>
                  {isSelected && (
                    <div className="mt-1.5 ml-7 flex items-center gap-2">
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">科目:</span>
                      <select
                        value={formData.student_subjects[student.id] ?? formData.subject}
                        onChange={(e) => setStudentSubject(student.id, e.target.value)}
                        className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-navy"
                      >
                        <option value="">未設定</option>
                        {SUBJECTS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-3">
          <Button type="submit" loading={isPending}>{lesson ? '更新する' : '作成する'}</Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>キャンセル</Button>
        </div>
        {onDelete && (
          <Button type="button" variant="danger" loading={isDeleting} onClick={handleDelete}>削除</Button>
        )}
      </div>

      {/* 削除影響確認モーダル */}
      <Modal
        open={deleteImpact !== null}
        onClose={() => setDeleteImpact(null)}
        title="コマ削除の影響確認"
        size="sm"
      >
        {deleteImpact === 'loading' ? (
          <p className="text-sm text-gray-500 py-4 text-center">影響を確認中...</p>
        ) : Array.isArray(deleteImpact) && (
          <div className="space-y-4">
            {deleteImpact.length > 0 ? (
              <>
                <p className="text-sm text-red-700 dark:text-red-300 font-semibold">
                  ⚠ このコマを削除すると {deleteImpact.length}名の生徒に影響が出ます
                </p>
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                  {deleteImpact.map((s) => (
                    <li key={s.id} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                      ・{s.name}
                      {s.hasPendingCredits && (
                        <span className="text-[10px] px-1 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-bold">振替残あり</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">影響を受ける受講生徒はいません。</p>
            )}
            <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <Button variant="danger" loading={isDeleting} onClick={() => { setDeleteImpact(null); execDelete() }}>
                削除する
              </Button>
              <Button variant="ghost" onClick={() => setDeleteImpact(null)}>
                キャンセル
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {undoToast && (
        <UndoToast
          auditLogId={undoToast.id}
          message={undoToast.message}
          onUndo={() => {
            if (navTimerRef.current) clearTimeout(navTimerRef.current)
            setUndoToast(null)
            router.refresh()
          }}
          onDismiss={() => {
            if (navTimerRef.current) clearTimeout(navTimerRef.current)
            setUndoToast(null)
            router.push(undoToast.navTarget)
          }}
        />
      )}
    </form>
  )
}
