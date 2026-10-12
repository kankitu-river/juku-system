'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { getDisplayGrade } from '@/lib/utils/grade'
import { SUBJECTS } from '@/lib/constants/timeSlots'
import { saveSlot, type SlotLessonInput } from '@/app/(dashboard)/schedule/actions'

interface TeacherOpt { id: string; name: string }
interface BoothOpt { id: string; name: string }
interface StudentOpt { id: string; name: string; grade: string }
interface RowStudent { id: string; name: string; grade: string; subject: string }

export interface SlotLessonRow {
  id: string | null
  teacher_id: string | null
  booth_id: string | null
  subject: string
  capacity: number
  is_ps1: boolean
  students: RowStudent[]
}

interface Props {
  ctx: { dow: number; slot: number; term: 'regular' | 'intensive'; type: 'group' | 'individual' }
  initialRows: SlotLessonRow[]
  teachers: TeacherOpt[]
  booths: BoothOpt[]
  students: StudentOpt[]
}

let tmpSeq = 0

export function SlotEditor({ ctx, initialRows, teachers, booths, students }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<(SlotLessonRow & { _key: string })[]>(
    initialRows.map((r) => ({ ...r, _key: r.id ?? `tmp-${tmpSeq++}` }))
  )
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [addStudentSel, setAddStudentSel] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  function update(key: string, patch: Partial<SlotLessonRow>) {
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((rs) => [...rs, { _key: `tmp-${tmpSeq++}`, id: null, teacher_id: null, booth_id: null, subject: '', capacity: ctx.type === 'group' ? 20 : 2, is_ps1: false, students: [] }])
  }
  function removeRow(key: string) {
    setRows((rs) => {
      const row = rs.find((r) => r._key === key)
      if (row?.id) setDeletedIds((d) => [...d, row.id!])
      return rs.filter((r) => r._key !== key)
    })
  }
  function addStudent(key: string) {
    const sid = addStudentSel[key]
    if (!sid) return
    const s = students.find((x) => x.id === sid)
    if (!s) return
    setRows((rs) => rs.map((r) => {
      if (r._key !== key) return r
      if (r.students.some((x) => x.id === sid)) return r
      return { ...r, students: [...r.students, { id: s.id, name: s.name, grade: s.grade, subject: r.subject || '' }] }
    }))
    setAddStudentSel((p) => ({ ...p, [key]: '' }))
  }
  function removeStudent(key: string, sid: string) {
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, students: r.students.filter((x) => x.id !== sid) } : r)))
  }
  function setStudentSubject(key: string, sid: string, subject: string) {
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, students: r.students.map((x) => (x.id === sid ? { ...x, subject } : x)) } : r)))
  }

  function handleSave() {
    setError(undefined); setMessage(undefined)
    const payload: SlotLessonInput[] = rows.map((r) => ({
      id: r.id,
      teacher_id: r.teacher_id,
      booth_id: r.booth_id,
      subject: r.subject,
      capacity: r.capacity,
      is_ps1: r.is_ps1,
      students: r.students.map((s) => ({ id: s.id, subject: s.subject })),
    }))
    startTransition(async () => {
      const res = await saveSlot(ctx, payload, deletedIds)
      if (res.error) { setError(res.error); return }
      setMessage('保存しました')
      setDeletedIds([])
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {message && <div className="rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 px-3 py-2 text-sm text-green-700 dark:text-green-300">{message}</div>}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r._key} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4">
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <Field label="担当先生">
                <select value={r.teacher_id ?? ''} onChange={(e) => update(r._key, { teacher_id: e.target.value || null })}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-navy">
                  <option value="">担当未設定</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="ブース">
                <select value={r.booth_id ?? ''} onChange={(e) => update(r._key, { booth_id: e.target.value || null })}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-navy">
                  <option value="">未割当</option>
                  {booths.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="科目">
                <select value={r.subject} onChange={(e) => update(r._key, { subject: e.target.value })}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-navy">
                  <option value="">—</option>
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="定員">
                <input type="number" min={1} value={r.capacity} onChange={(e) => update(r._key, { capacity: Number(e.target.value) || 1 })}
                  className="w-16 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-navy" />
              </Field>
              <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 pb-1.5">
                <input type="checkbox" checked={r.is_ps1} onChange={(e) => update(r._key, { is_ps1: e.target.checked })} />
                1対1(PS1)
              </label>
              <button type="button" onClick={() => removeRow(r._key)} className="ml-auto text-xs text-red-500 hover:underline pb-1.5">この授業を削除</button>
            </div>

            {/* 生徒 */}
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">生徒（{r.students.length}/{r.capacity}）</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {r.students.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg pl-2 pr-1 py-1 text-xs">
                    <span className="text-gray-700 dark:text-gray-200">{s.name}</span>
                    <span className="text-[10px] text-gray-400">{getDisplayGrade(s.grade)}</span>
                    <select value={s.subject} onChange={(e) => setStudentSubject(r._key, s.id, e.target.value)}
                      className="text-[11px] border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800">
                      <option value="">科目</option>
                      {SUBJECTS.map((su) => <option key={su} value={su}>{su}</option>)}
                    </select>
                    <button type="button" onClick={() => removeStudent(r._key, s.id)} className="text-red-400 hover:text-red-600 px-0.5">×</button>
                  </span>
                ))}
                {r.students.length === 0 && <span className="text-xs text-gray-400">生徒なし</span>}
              </div>
              <div className="flex gap-2">
                <select value={addStudentSel[r._key] ?? ''} onChange={(e) => setAddStudentSel((p) => ({ ...p, [r._key]: e.target.value }))}
                  className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-navy">
                  <option value="">＋ 生徒を追加</option>
                  {students.filter((s) => !r.students.some((x) => x.id === s.id)).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}（{getDisplayGrade(s.grade)}）</option>
                  ))}
                </select>
                <Button type="button" variant="secondary" onClick={() => addStudent(r._key)} disabled={!addStudentSel[r._key]}>追加</Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={addRow} className="w-full py-2.5 text-sm text-navy dark:text-blue-300 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50">
        ＋ この枠に授業（ブース）を追加
      </button>

      <div className="sticky bottom-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur py-3 flex gap-2">
        <Button onClick={handleSave} loading={isPending} className="flex-1">まとめて保存</Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{label}</label>
      {children}
    </div>
  )
}
