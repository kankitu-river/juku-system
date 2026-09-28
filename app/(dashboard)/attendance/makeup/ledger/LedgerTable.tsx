'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { getDisplayGrade } from '@/lib/utils/grade'
import {
  addMakeupRequest, updateMakeupRequest, scheduleMakeupRequest,
  completeMakeupRequest, setMakeupStatus, deleteMakeupRequest, unassignMakeupRequest,
  type MakeupStatus, type MakeupRequestInput,
} from './actions'

export interface LedgerRow {
  id: string
  student_name: string
  student: { id: string; name: string; grade: string } | null
  received_date: string | null
  original_lesson: string
  subject: string
  desired_raw: string
  scheduled_date: string | null
  status: MakeupStatus
  next_test_date: string
  notes: string
  source_sheet: string
  assigned_lesson_id: string | null
  assigned_date: string | null
}

interface StudentOpt { id: string; name: string; grade: string }
type Filter = 'all' | 'pending' | 'scheduled' | 'completed'

const STATUS_META: Record<MakeupStatus, { label: string; cls: string }> = {
  pending: { label: '未定', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  scheduled: { label: '決定', cls: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300' },
  completed: { label: '済', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

const EMPTY_FORM: MakeupRequestInput = {
  studentId: null, studentName: '', subject: '', originalLesson: '',
  desiredRaw: '', scheduledDate: null, status: 'pending', nextTestDate: '', notes: '',
}

export function LedgerTable({ rows, students }: { rows: LedgerRow[]; students: StudentOpt[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('pending')
  const [q, setQ] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  // 追加/編集フォーム
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<MakeupRequestInput>(EMPTY_FORM)

  // 日程決定モーダル
  const [scheduleFor, setScheduleFor] = useState<LedgerRow | null>(null)
  const [scheduleDate, setScheduleDate] = useState('')

  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    scheduled: rows.filter((r) => r.status === 'scheduled').length,
    completed: rows.filter((r) => r.status === 'completed').length,
  }), [rows])

  // 生徒ごとの残数（未消化＝未定＋決定）
  const remainingByStudent = useMemo(() => {
    const m = new Map<string, { name: string; grade: string; count: number }>()
    for (const r of rows) {
      if (r.status === 'completed') continue
      const key = r.student?.id ?? r.student_name
      const cur = m.get(key) ?? { name: r.student?.name ?? r.student_name, grade: r.student?.grade ?? '', count: 0 }
      cur.count++
      m.set(key, cur)
    }
    return [...m.values()].sort((a, b) => b.count - a.count)
  }, [rows])

  const filtered = useMemo(() => {
    const kw = q.trim()
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false
      if (kw && !r.student_name.includes(kw) && !r.subject.includes(kw)) return false
      return true
    })
  }, [rows, filter, q])

  const tabs: { key: Filter; label: string }[] = [
    { key: 'pending', label: `未定 (${counts.pending})` },
    { key: 'scheduled', label: `決定 (${counts.scheduled})` },
    { key: 'completed', label: `済 (${counts.completed})` },
    { key: 'all', label: `すべて (${counts.all})` },
  ]

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(undefined)
    startTransition(async () => {
      const r = await fn()
      if (r.error) { setError(r.error); return }
      after?.()
      router.refresh()
    })
  }

  function openAdd() {
    setEditId(null); setForm(EMPTY_FORM); setFormOpen(true)
  }
  function openEdit(r: LedgerRow) {
    setEditId(r.id)
    setForm({
      studentId: r.student?.id ?? null,
      studentName: r.student?.name ?? r.student_name,
      subject: r.subject, originalLesson: r.original_lesson,
      desiredRaw: r.desired_raw, scheduledDate: r.scheduled_date,
      status: r.status, nextTestDate: r.next_test_date, notes: r.notes,
    })
    setFormOpen(true)
  }
  function submitForm() {
    run(
      () => editId ? updateMakeupRequest(editId, form) : addMakeupRequest(form),
      () => setFormOpen(false)
    )
  }

  function openSchedule(r: LedgerRow) {
    setScheduleFor(r); setScheduleDate(r.scheduled_date ?? '')
  }
  function submitSchedule() {
    if (!scheduleFor) return
    run(() => scheduleMakeupRequest(scheduleFor.id, scheduleDate), () => setScheduleFor(null))
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {/* 生徒別の振替残数（未消化） */}
      {remainingByStudent.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">生徒別の未消化（残数）</p>
          <div className="flex flex-wrap gap-1.5">
            {remainingByStudent.map((s) => (
              <span key={s.name} className="inline-flex items-center gap-1 text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-full px-2 py-1">
                <span className="text-gray-700 dark:text-gray-200">{s.name}</span>
                {s.grade && <span className="text-[10px] text-gray-400">{getDisplayGrade(s.grade)}</span>}
                <span className="font-bold text-amber-700 dark:text-amber-300">{s.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              filter === t.key
                ? 'bg-navy text-white border-navy'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            {t.label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="生徒名・教科で絞り込み"
          className="min-w-[160px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-navy"
        />
        <Button type="button" onClick={openAdd} className="ml-auto">＋ 振替を追加</Button>
      </div>

      <div className="overflow-x-auto bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="px-3 py-2 font-medium">状態</th>
              <th className="px-3 py-2 font-medium">生徒</th>
              <th className="px-3 py-2 font-medium">教科</th>
              <th className="px-3 py-2 font-medium">元の授業</th>
              <th className="px-3 py-2 font-medium">振替希望/決定日</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const meta = STATUS_META[r.status]
              return (
                <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-gray-800 dark:text-gray-100">{r.student?.name ?? r.student_name}</span>
                    {r.student?.grade && <span className="ml-1 text-xs text-gray-400">{getDisplayGrade(r.student.grade)}</span>}
                    {!r.student && <span className="ml-1 text-[10px] text-red-400">名簿未一致</span>}
                    {r.notes && <p className="text-[10px] text-gray-400 max-w-[200px] truncate" title={r.notes}>{r.notes}</p>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">{r.subject || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400">{r.original_lesson || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                    {r.scheduled_date
                      ? <span className="font-medium">{r.scheduled_date}</span>
                      : <span className="text-gray-500 dark:text-gray-400">{r.desired_raw || '—'}</span>}
                    {r.assigned_lesson_id && (
                      <p className="text-[10px] text-navy dark:text-blue-300 mt-0.5">コマ配置済</p>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {r.status === 'pending' && (
                        <button onClick={() => openSchedule(r)} disabled={isPending}
                          className="text-xs px-2 py-1 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">日程を決める</button>
                      )}
                      {r.status === 'scheduled' && (
                        <>
                          <button onClick={() => run(() => completeMakeupRequest(r.id))} disabled={isPending}
                            className="text-xs px-2 py-1 rounded-md bg-navy text-white hover:bg-navy-light disabled:opacity-50">済にする</button>
                          {r.assigned_lesson_id && (
                            <button onClick={() => run(() => unassignMakeupRequest(r.id))} disabled={isPending}
                              className="text-xs px-2 py-1 rounded-md border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50" title="コマ配置を外して置き直せる状態に戻す">配置を取消</button>
                          )}
                          <button onClick={() => run(() => setMakeupStatus(r.id, 'pending'))} disabled={isPending}
                            className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50">未定へ</button>
                        </>
                      )}
                      {r.status === 'completed' && (
                        <button onClick={() => run(() => setMakeupStatus(r.id, 'scheduled'))} disabled={isPending}
                          className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50">戻す</button>
                      )}
                      <button onClick={() => openEdit(r)} disabled={isPending}
                        className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50">編集</button>
                      <button onClick={() => { if (confirm('この振替を削除しますか？')) run(() => deleteMakeupRequest(r.id)) }} disabled={isPending}
                        className="text-xs px-2 py-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50">削除</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400 text-sm">該当する振替がありません</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 追加・編集フォーム */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editId ? '振替を編集' : '振替を追加'} size="md">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">生徒</label>
            <select
              value={form.studentId ?? ''}
              onChange={(e) => {
                const s = students.find((x) => x.id === e.target.value)
                setForm((f) => ({ ...f, studentId: s?.id ?? null, studentName: s?.name ?? f.studentName }))
              }}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            >
              <option value="">— 生徒を選択 —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}（{getDisplayGrade(s.grade)}）</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="教科" value={form.subject} onChange={(v) => setForm((f) => ({ ...f, subject: v }))} />
            <Field label="元の授業（日付や「夏期講習」等）" value={form.originalLesson} onChange={(v) => setForm((f) => ({ ...f, originalLesson: v }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">状態</label>
            <div className="flex gap-2">
              {(['pending', 'scheduled', 'completed'] as MakeupStatus[]).map((st) => (
                <button key={st} type="button" onClick={() => setForm((f) => ({ ...f, status: st }))}
                  className={`flex-1 py-1.5 text-xs rounded-lg border font-medium ${
                    form.status === st ? 'border-navy bg-navy text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                  }`}>{STATUS_META[st].label}</button>
              ))}
            </div>
          </div>
          {form.status !== 'pending' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">振替日（決定日）</label>
              <input type="date" value={form.scheduledDate ?? ''} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value || null }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy" />
            </div>
          )}
          <Field label="振替希望メモ（未定時の希望など）" value={form.desiredRaw} onChange={(v) => setForm((f) => ({ ...f, desiredRaw: v }))} />
          <Field label="次回定期テスト日" value={form.nextTestDate} onChange={(v) => setForm((f) => ({ ...f, nextTestDate: v }))} />
          <Field label="備考" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
          <div className="flex gap-2 pt-1">
            <Button className="flex-1" onClick={submitForm} loading={isPending}>{editId ? '保存' : '追加'}</Button>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>キャンセル</Button>
          </div>
        </div>
      </Modal>

      {/* 日程決定モーダル */}
      <Modal open={!!scheduleFor} onClose={() => setScheduleFor(null)} title="振替日を決める" size="sm">
        {scheduleFor && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{scheduleFor.student?.name ?? scheduleFor.student_name}</span>さん・{scheduleFor.subject || '—'} の振替日を入力すると「決定」になります。
            </p>
            <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy" />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={submitSchedule} loading={isPending} disabled={!scheduleDate}>決定にする</Button>
              <Button variant="ghost" onClick={() => setScheduleFor(null)}>キャンセル</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy" />
    </div>
  )
}
