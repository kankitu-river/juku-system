'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { assignMakeupFromLedger, markAbsentToLedger } from '@/app/(dashboard)/attendance/makeup/ledger/actions'
import { addTemporaryStudent, removeTemporaryStudent, skipStudentForDate, unskipStudentForDate, moveStudentForDate, updateTemporaryStudentSubject, setLessonTeacherOverride, clearLessonTeacherOverride, addStandbyShift } from '@/app/(dashboard)/schedule/actions'
import { getDisplayGrade } from '@/lib/utils/grade'
import { SUBJECTS } from '@/lib/constants/timeSlots'

interface EnrolledOpt { id: string; name: string; grade?: string; subject?: string }
interface LedgerItem { id: string; studentName: string; subject: string; status: 'pending' | 'scheduled'; scheduledDate: string | null }
interface ExistingMakeup { id: string; studentName: string; date: string }
interface StudentOpt { id: string; name: string; grade: string }
interface TemporaryEntry { id: string; studentName: string; date: string; subject?: string }
interface AbsenceEntry { studentId: string; studentName: string; date: string }
interface MoveTarget { id: string; label: string }
interface TeacherOpt { id: string; name: string }
interface TeacherOverrideEntry { date: string; teacherName: string }

interface Props {
  lessonId: string
  fixedDate: string | null // 臨時コマは開催日固定。通常コマは null（日付を選ぶ）
  dayOfWeek: number
  lessonLabel: string // 元授業ラベル（例「第2コマ」）
  enrolled: EnrolledOpt[]
  ledgerItems: LedgerItem[] // 台帳の未消化（未定・決定）
  existingMakeups: ExistingMakeup[]
  allStudents: StudentOpt[] // 臨時追加用（全生徒）
  existingTemporary: TemporaryEntry[] // このコマの臨時参加
  existingAbsences: AbsenceEntry[] // このコマで「その日だけ外した」記録
  moveTargets: MoveTarget[] // 別のコマへ移動の候補（同曜日・同期間の他コマ）
  teachers: TeacherOpt[] // 担当差し替え・待機追加用の先生一覧
  existingTeacherOverrides: TeacherOverrideEntry[] // その日だけ担当差し替えの記録
  slotStart: string // このコマの開始時刻 'HH:MM'
  slotEnd: string // このコマの終了時刻 'HH:MM'
}

function pad(n: number) { return String(n).padStart(2, '0') }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

// 今日以降で、指定曜日(1=月..6=土)の直近の日付
function nextDateForDow(dow: number): string {
  const today = new Date()
  const cur = today.getDay() === 0 ? 7 : today.getDay()
  let diff = dow - cur
  if (diff < 0) diff += 7
  const d = new Date(today)
  d.setDate(today.getDate() + diff)
  return toDateStr(d)
}

export function LessonMakeupPanel({ lessonId, fixedDate, dayOfWeek, lessonLabel, enrolled, ledgerItems, existingMakeups, allStudents, existingTemporary, existingAbsences, moveTargets, teachers, existingTeacherOverrides, slotStart, slotEnd }: Props) {
  const router = useRouter()
  const [date, setDate] = useState<string>(fixedDate ?? nextDateForDow(dayOfWeek))
  const [ledgerItemId, setLedgerItemId] = useState('')
  const [scheduledLedgerId, setScheduledLedgerId] = useState('')
  const [absentStudentId, setAbsentStudentId] = useState('')
  const [absentConfirm, setAbsentConfirm] = useState<EnrolledOpt | null>(null)
  const [tempStudentId, setTempStudentId] = useState('')
  const [tempSubject, setTempSubject] = useState('')
  const [skipStudentId, setSkipStudentId] = useState('')
  const [moveStudentId, setMoveStudentId] = useState('')
  const [moveTargetId, setMoveTargetId] = useState('')
  const [overrideTeacherId, setOverrideTeacherId] = useState('')
  const [standbyTeacherId, setStandbyTeacherId] = useState('')

  function handleAddStandby() {
    if (!standbyTeacherId || !date) return
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await addStandbyShift(standbyTeacherId, date, slotStart, slotEnd, lessonId)
      if (result.error) { setError(result.error); return }
      const name = teachers.find((t) => t.id === standbyTeacherId)?.name ?? '先生'
      setMessage(`${name}先生を${date}の${slotStart}〜${slotEnd}に待機（シフト）追加しました`)
      setStandbyTeacherId('')
      router.refresh()
    })
  }

  function handleSetTeacherOverride() {
    if (!date) return
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await setLessonTeacherOverride(lessonId, date, overrideTeacherId || null)
      if (result.error) { setError(result.error); return }
      const name = teachers.find((t) => t.id === overrideTeacherId)?.name ?? '担当未定'
      setMessage(`${date} だけ担当を「${name}」に変更しました（他の週はそのまま）`)
      setOverrideTeacherId('')
      router.refresh()
    })
  }

  function handleClearTeacherOverride(d: string) {
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await clearLessonTeacherOverride(lessonId, d)
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  function handleMove() {
    if (!moveStudentId || !moveTargetId || !date) return
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await moveStudentForDate(moveStudentId, lessonId, moveTargetId, date)
      if (result.error) { setError(result.error); return }
      const name = enrolled.find((s) => s.id === moveStudentId)?.name ?? '生徒'
      const target = moveTargets.find((t) => t.id === moveTargetId)?.label ?? '別のコマ'
      setMessage(`${name}さんを${date}だけ「${target}」へ移動しました`)
      setMoveStudentId(''); setMoveTargetId('')
      router.refresh()
    })
  }

  function handleSkip() {
    if (!skipStudentId || !date) return
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await skipStudentForDate(skipStudentId, lessonId, date)
      if (result.error) { setError(result.error); return }
      const name = enrolled.find((s) => s.id === skipStudentId)?.name ?? '生徒'
      setMessage(`${name}さんを${date}だけ外しました（他の週はそのまま）`)
      setSkipStudentId('')
      router.refresh()
    })
  }

  function handleUnskip(studentId: string, d: string) {
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await unskipStudentForDate(studentId, lessonId, d)
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  function handleAddTemporary() {
    if (!tempStudentId || !date) return
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await addTemporaryStudent(tempStudentId, lessonId, date, tempSubject)
      if (result.error) { setError(result.error); return }
      const name = allStudents.find((s) => s.id === tempStudentId)?.name ?? '生徒'
      setMessage(`${name}さんを${date}の臨時参加として追加しました${tempSubject ? `（${tempSubject}）` : ''}`)
      setTempStudentId(''); setTempSubject('')
      router.refresh()
    })
  }

  function handleRemoveTemporary(id: string) {
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await removeTemporaryStudent(id, lessonId)
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  function handleUpdateTempSubject(id: string, subject: string) {
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await updateTemporaryStudentSubject(id, subject, lessonId)
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  function handleAddMakeup() {
    if (!ledgerItemId || !date) return
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await assignMakeupFromLedger(ledgerItemId, lessonId, date)
      if (result.error) { setError(result.error); return }
      const item = ledgerItems.find((i) => i.id === ledgerItemId)
      setMessage(`${item?.studentName ?? '生徒'}さんの振替を${date}に割り当て、台帳を「済」にしました`)
      setLedgerItemId('')
      router.refresh()
    })
  }

  function handleLinkScheduled() {
    if (!scheduledLedgerId) return
    const item = ledgerItems.find((i) => i.id === scheduledLedgerId)
    const useDate = item?.scheduledDate || date
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await assignMakeupFromLedger(scheduledLedgerId, lessonId, useDate)
      if (result.error) { setError(result.error); return }
      setMessage(`${item?.studentName ?? '生徒'}さんの決定済み振替を${useDate}でこのコマに紐づけました`)
      setScheduledLedgerId('')
      router.refresh()
    })
  }

  function handleAbsent() {
    if (!absentConfirm || !date) return
    const student = absentConfirm
    setAbsentConfirm(null)
    setError(undefined); setMessage(undefined)
    startTransition(async () => {
      const result = await markAbsentToLedger({
        studentId: student.id,
        studentName: student.name,
        subject: student.subject ?? '',
        lessonId,
        date,
        originalLabel: `${date}（${lessonLabel}）`,
      })
      if (result.error) { setError(result.error); return }
      setMessage(`${student.name}さんを${date}に欠席とし、振替（未定）を台帳に追加しました`)
      setAbsentStudentId('')
      router.refresh()
    })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
      <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 text-sm">振替・欠席（特定日）</h3>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
      )}
      {message && (
        <div className="mb-3 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 px-3 py-2 text-xs text-green-700 dark:text-green-300">{message}</div>
      )}

      {/* 対象日：以下すべての操作はこの日付に対して行われる */}
      <div className="mb-4 rounded-lg border border-navy/30 bg-blue-50/50 dark:bg-blue-950/30 p-3">
        <label className="block text-xs font-bold text-navy dark:text-blue-300 mb-1">📅 対象日（下の操作はすべてこの日付に反映されます）</label>
        {fixedDate ? (
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 rounded-lg px-3 py-2">
            {fixedDate}（臨時コマの開催日）
          </div>
        ) : (
          <>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setMessage(undefined); setError(undefined) }}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            />
            <p className="text-[11px] text-navy dark:text-blue-300 mt-1 font-medium">
              → {new Date(`${date}T12:00:00`).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })} の回に対して操作します。別の週にするには日付を変えてください
            </p>
          </>
        )}
      </div>

      {/* 振替で追加（台帳の未定をこのコマに割り当て） */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">振替で追加（未定の振替から）</label>
        <div className="flex gap-2">
          <select
            value={ledgerItemId}
            onChange={(e) => setLedgerItemId(e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="">— 未定の振替を選択 —</option>
            {ledgerItems.filter((i) => i.status === 'pending').map((i) => (
              <option key={i.id} value={i.id}>
                {i.studentName}{i.subject ? `・${i.subject}` : ''}
              </option>
            ))}
          </select>
          <Button type="button" onClick={handleAddMakeup} loading={isPending} disabled={!ledgerItemId}>追加</Button>
        </div>
        {ledgerItems.filter((i) => i.status === 'pending').length === 0 && (
          <p className="text-[11px] text-gray-400 mt-1">未定の振替がありません</p>
        )}
      </div>

      {/* 決定済みの振替から、このコマに紐づけ */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">決定済みの振替から紐づけ</label>
        <div className="flex gap-2">
          <select
            value={scheduledLedgerId}
            onChange={(e) => setScheduledLedgerId(e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="">— 決定済みの振替を選択 —</option>
            {ledgerItems.filter((i) => i.status === 'scheduled').map((i) => (
              <option key={i.id} value={i.id}>
                {i.studentName}{i.subject ? `・${i.subject}` : ''}（決定 {i.scheduledDate ?? '日付未設定'}）
              </option>
            ))}
          </select>
          <Button type="button" onClick={handleLinkScheduled} loading={isPending} disabled={!scheduledLedgerId}>紐づけ</Button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">決定日でこのコマに紐づけます。紐づけると下の「このコマへの振替予定」に出ます</p>
        {ledgerItems.filter((i) => i.status === 'scheduled').length === 0 && (
          <p className="text-[11px] text-gray-400 mt-1">決定済みの振替がありません</p>
        )}
      </div>

      {/* 欠席→振替へ回す（台帳に未定で追加） */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">欠席にして振替へ回す（受講生徒）</label>
        <div className="flex gap-2">
          <select
            value={absentStudentId}
            onChange={(e) => setAbsentStudentId(e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="">— 生徒を選択 —</option>
            {enrolled.map((s) => (
              <option key={s.id} value={s.id}>
                {s.grade ? `${s.name}（${getDisplayGrade(s.grade)}）` : s.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const s = enrolled.find((x) => x.id === absentStudentId)
              if (s) setAbsentConfirm(s)
            }}
            disabled={!absentStudentId}
          >
            欠席
          </Button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">選んだ日に欠席として記録し、台帳に「未定」の振替を1件追加します</p>
      </div>

      {/* 臨時で追加（この日だけ・通常メンバー以外を1回だけ参加） */}
      <div className="mb-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">臨時で追加（この日だけ）</label>
        <div className="space-y-2">
          <select
            value={tempStudentId}
            onChange={(e) => setTempStudentId(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="">— 生徒を選択 —</option>
            {allStudents.map((s) => (
              <option key={s.id} value={s.id}>{s.grade ? `${s.name}（${getDisplayGrade(s.grade)}）` : s.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={tempSubject}
              onChange={(e) => setTempSubject(e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            >
              <option value="">科目（任意）</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={handleAddTemporary} loading={isPending} disabled={!tempStudentId}>{date} に追加</Button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">通常メンバーは変えずに、<b>{date}</b> だけこのコマに参加させます（他の週に影響しません）</p>
        {existingTemporary.length > 0 && (
          <div className="mt-2 space-y-1">
            {existingTemporary.map((t) => (
              <div key={t.id} className="text-xs text-orange-700 dark:text-orange-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full flex-shrink-0" />
                <span>{t.studentName}</span>
                <span className="text-[10px] text-gray-400">{t.date}</span>
                <select
                  value={t.subject ?? ''}
                  onChange={(e) => handleUpdateTempSubject(t.id, e.target.value)}
                  disabled={isPending}
                  className="text-[11px] border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 disabled:opacity-50"
                >
                  <option value="">科目なし</option>
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button type="button" onClick={() => handleRemoveTemporary(t.id)} disabled={isPending}
                  className="ml-auto text-[10px] text-red-500 hover:underline disabled:opacity-50">削除</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* その日だけ外す（通常メンバーを1回だけ休みにする） */}
      <div className="mb-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">その日だけ外す（通常メンバー）</label>
        <div className="flex gap-2">
          <select
            value={skipStudentId}
            onChange={(e) => setSkipStudentId(e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="">— 生徒を選択 —</option>
            {enrolled.map((s) => (
              <option key={s.id} value={s.id}>{s.grade ? `${s.name}（${getDisplayGrade(s.grade)}）` : s.name}</option>
            ))}
          </select>
          <Button type="button" variant="secondary" onClick={handleSkip} loading={isPending} disabled={!skipStudentId}>{date} だけ外す</Button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1"><b>{date}</b> だけこのコマから外します（欠席扱い・振替なし）。他の週はそのままです</p>
        {existingAbsences.length > 0 && (
          <div className="mt-2 space-y-1">
            {existingAbsences.map((a) => (
              <div key={`${a.studentId}-${a.date}`} className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0" />
                <span className="line-through">{a.studentName}</span>
                <span className="text-[10px] text-gray-400">{a.date}</span>
                <button type="button" onClick={() => handleUnskip(a.studentId, a.date)} disabled={isPending}
                  className="ml-auto text-[10px] text-navy dark:text-blue-300 hover:underline disabled:opacity-50">戻す</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 別のコマへ移動（この日だけ・元コマから外して他コマへ臨時追加） */}
      {moveTargets.length > 0 && (
        <div className="mb-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">別の先生のコマへ移動（この日だけ）</label>
          <div className="space-y-2">
            <select
              value={moveStudentId}
              onChange={(e) => setMoveStudentId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            >
              <option value="">— 生徒を選択 —</option>
              {enrolled.map((s) => (
                <option key={s.id} value={s.id}>{s.grade ? `${s.name}（${getDisplayGrade(s.grade)}）` : s.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={moveTargetId}
                onChange={(e) => setMoveTargetId(e.target.value)}
                className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
              >
                <option value="">— 移動先のコマを選択 —</option>
                {moveTargets.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <Button type="button" onClick={handleMove} loading={isPending} disabled={!moveStudentId || !moveTargetId}>{date} 移動</Button>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-1"><b>{date}</b> だけ、このコマから外して移動先コマに臨時で入れます（他の週はそのまま）</p>
        </div>
      )}

      {/* その日だけ担当を変更（代講） */}
      <div className="mb-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">その日だけ担当の先生を変更（代講）</label>
        <div className="flex gap-2">
          <select
            value={overrideTeacherId}
            onChange={(e) => setOverrideTeacherId(e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="">— 先生を選択（空欄＝担当未定） —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <Button type="button" variant="secondary" onClick={handleSetTeacherOverride} loading={isPending}>{date} 変更</Button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1"><b>{date}</b> だけこのコマの担当を差し替えます（毎週の担当はそのまま）</p>
        {existingTeacherOverrides.length > 0 && (
          <div className="mt-2 space-y-1">
            {existingTeacherOverrides.map((o) => (
              <div key={o.date} className="text-xs text-orange-700 dark:text-orange-300 flex items-center gap-1.5">
                <span className="text-[10px] font-bold bg-orange-100 dark:bg-orange-900/60 px-1 rounded">代</span>
                <span>{o.teacherName}</span>
                <span className="text-[10px] text-gray-400">{o.date}</span>
                <button type="button" onClick={() => handleClearTeacherOverride(o.date)} disabled={isPending}
                  className="ml-auto text-[10px] text-navy dark:text-blue-300 hover:underline disabled:opacity-50">戻す</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* この時間に待機できる先生を追加（＝シフト追加） */}
      <div className="mb-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">この時間に待機できる先生を追加</label>
        <div className="flex gap-2">
          <select
            value={standbyTeacherId}
            onChange={(e) => setStandbyTeacherId(e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="">— 先生を選択 —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <Button type="button" variant="secondary" onClick={handleAddStandby} loading={isPending} disabled={!standbyTeacherId}>待機追加</Button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1"><b>{date}</b> の {slotStart}〜{slotEnd} にシフトを追加します。コマ未担当ならカレンダー・印刷に「待機（空き）」として出ます（シフト表にも反映）</p>
      </div>

      {/* このコマへの振替予定 */}
      {existingMakeups.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">このコマへの振替予定</p>
          <div className="space-y-1">
            {existingMakeups.map((m) => (
              <div key={m.id} className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                <span>{m.studentName}</span>
                <span className="text-[10px] text-gray-400">{m.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!absentConfirm} onClose={() => setAbsentConfirm(null)} title="欠席・振替の確認" size="sm">
        {absentConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{absentConfirm.name}</span>さんを
              <span className="font-semibold"> {date} </span>
              に欠席として記録し、台帳に「未定」の振替を1件追加します。よろしいですか？
            </p>
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={handleAbsent} loading={isPending}>欠席にして振替を台帳へ追加</Button>
              <Button className="w-full" variant="ghost" onClick={() => setAbsentConfirm(null)}>キャンセル</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
