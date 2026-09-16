'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  previewImport, commitImport, type ImportPreview, type ImportResult,
  previewSchedule, commitSchedule, type SchedulePreview, type ScheduleResult,
  previewRegular, commitRegular, type RegularPreview, type RegularResult,
} from './actions'

export function ImportClient() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          スケ組みソフトの Excel（.xlsm / .xlsx）を1つ選んでください。名簿・夏期講習コマの両方をこのファイルから取り込みます。
        </p>
        <input
          type="file"
          accept=".xlsm,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-navy file:text-white hover:file:bg-navy-light"
        />
        {file && <p className="text-xs text-gray-400 mt-2">選択中: {file.name}</p>}
      </div>

      <RosterSection file={file} onDone={() => router.refresh()} />
      <ScheduleSection file={file} onDone={() => router.refresh()} />
      <RegularSection file={file} onDone={() => router.refresh()} />
    </div>
  )
}

const DOW_LABELS: Record<number, string> = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' }

// ── 新学期の通常授業インポート ──────────────────────────────
function RegularSection({ file, onDone }: { file: File | null; onDone: () => void }) {
  const [preview, setPreview] = useState<RegularPreview | null>(null)
  const [result, setResult] = useState<RegularResult | null>(null)
  const [pending, startTransition] = useTransition()
  // 未一致の手動解決: key(表記/講師名) -> 選択したid
  const [teacherSel, setTeacherSel] = useState<Record<string, string>>({})
  const [studentSel, setStudentSel] = useState<Record<string, string>>({})

  function runPreview() {
    if (!file) return
    const fd = new FormData(); fd.set('file', file)
    setResult(null); setTeacherSel({}); setStudentSel({})
    startTransition(async () => { setPreview(await previewRegular(fd)) })
  }

  function runCommit() {
    if (!file || !preview) return
    const unresolvedS = preview.unmatchedStudents.filter((u) => !studentSel[u.key]).length
    const unresolvedT = preview.unmatchedTeachers.filter((u) => !teacherSel[u.key]).length
    const warn = (unresolvedT > 0 || unresolvedS > 0)
      ? `未一致のまま進めると、講師 ${unresolvedT}件は担当空欄、生徒 ${unresolvedS}件は受講登録がスキップされます。\n`
      : ''
    if (!confirm(`${warn}既存の通常コマ ${preview.existingRegularCount}件を全て削除して、${preview.lessonCount}件を新規登録します。よろしいですか？`)) return
    const fd = new FormData(); fd.set('file', file)
    setResult(null)
    startTransition(async () => {
      const r = await commitRegular(fd, teacherSel, studentSel)
      setResult(r)
      if (!r.error) { setPreview(null); onDone() }
    })
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">③ 新学期の通常授業（マスターExcel）</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          「マスター」シートから毎週の通常コマ（曜日×コマ×担当×生徒）を取り込みます。既存の通常コマは全て削除して入れ替えます（講習コマは残ります）。
        </p>
        <a
          href="/api/export/schedule-master"
          className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          ⬇ 現在の通常授業をExcelで書き出す（同じ型）
        </a>
      </div>

      <button onClick={runPreview} disabled={!file || pending}
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {pending ? '処理中…' : '内容を確認する'}
      </button>

      {preview?.error && <ErrBox msg={preview.error} />}
      {preview && !preview.error && (
        <div className="space-y-4">
          <div className="text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-1">
            <p>コマ: <span className="font-semibold">{preview.lessonCount}</span>（個別 {preview.individualCount}・集団 {preview.groupCount}）</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              曜日別: {[1, 2, 3, 4, 5, 6].map((d) => `${DOW_LABELS[d]}${preview.byDow[d] ?? 0}`).join(' / ')}
            </p>
            <p>生徒一致: <span className="font-semibold">{preview.matchedStudents}/{preview.totalStudents}</span></p>
            <p className="text-red-600 dark:text-red-400">既存の通常コマ {preview.existingRegularCount}件を削除して入れ替えます。</p>
          </div>

          {preview.unmatchedTeachers.length > 0 && (
            <MatchResolver
              title={`未一致の講師（${preview.unmatchedTeachers.length}）— 正しい先生を選ぶと担当に設定されます`}
              items={preview.unmatchedTeachers} all={preview.allTeachers}
              sel={teacherSel} setSel={setTeacherSel}
            />
          )}
          {preview.unmatchedStudents.length > 0 && (
            <MatchResolver
              title={`未一致の生徒（${preview.unmatchedStudents.length}）— 正しい生徒を選ぶと今後は自動一致します`}
              items={preview.unmatchedStudents} all={preview.allStudents}
              sel={studentSel} setSel={setStudentSel}
            />
          )}
          {preview.unmatchedTeachers.length === 0 && preview.unmatchedStudents.length === 0 && (
            <p className="text-sm text-green-600 dark:text-green-400">全ての講師・生徒が一致しました。</p>
          )}

          <button onClick={runCommit} disabled={pending}
            className="px-4 py-2 text-sm bg-navy text-white rounded-lg hover:bg-navy-light disabled:opacity-50 font-medium">
            {pending ? '登録中…' : 'この内容で入れ替え登録する'}
          </button>
        </div>
      )}
      {result?.error && <ErrBox msg={result.error} />}
      {result && !result.error && (
        <>
          <OkBox msg={`通常コマ ${result.insertedLessons}件・受講 ${result.insertedEnrollments}件を登録（既存 ${result.deleted}件を削除）。${result.unresolvedTeacherLessons > 0 ? `担当空欄 ${result.unresolvedTeacherLessons}件。` : ''}${result.skippedEnrollments > 0 ? `未一致生徒の受講 ${result.skippedEnrollments}件はスキップ。` : ''}`} />
          {result.enrollWarning && <ErrBox msg={result.enrollWarning} />}
        </>
      )}
    </div>
  )
}

function MatchResolver({ title, items, all, sel, setSel }: {
  title: string
  items: { key: string; candidates: { id: string; name: string }[] }[]
  all: { id: string; name: string }[]
  sel: Record<string, string>
  setSel: (fn: (prev: Record<string, string>) => Record<string, string>) => void
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">{title}</p>
      <div className="space-y-2">
        {items.map((it) => {
          const candIds = new Set(it.candidates.map((c) => c.id))
          const others = all.filter((o) => !candIds.has(o.id))
          return (
            <div key={it.key} className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-100 w-32 shrink-0 truncate">{it.key}</span>
              <span className="text-gray-400">→</span>
              <select
                value={sel[it.key] ?? ''}
                onChange={(e) => setSel((prev) => ({ ...prev, [it.key]: e.target.value }))}
                className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-navy"
              >
                <option value="">（未選択）</option>
                {it.candidates.length > 0 && (
                  <optgroup label="候補">
                    {it.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                )}
                <optgroup label="すべて">
                  {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </optgroup>
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 名簿インポート ──────────────────────────────
function RosterSection({ file, onDone }: { file: File | null; onDone: () => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [pending, startTransition] = useTransition()

  function run(fn: 'preview' | 'commit') {
    if (!file) return
    const fd = new FormData(); fd.set('file', file)
    setResult(null)
    startTransition(async () => {
      if (fn === 'preview') { setPreview(await previewImport(fd)) }
      else {
        const r = await commitImport(fd); setResult(r)
        if (!r.error) { setPreview(null); onDone() }
      }
    })
  }

  const nothingNew = preview && !preview.error &&
    preview.newTeachers.length === 0 && preview.newStudents.length === 0 && preview.furiganaUpdates.length === 0

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">① 名簿（講師・生徒・ふりがな）</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">未登録の講師・生徒・ふりがなだけを追加します。既存は上書きしません。</p>
      </div>
      <button onClick={() => run('preview')} disabled={!file || pending}
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {pending ? '処理中…' : '内容を確認する'}
      </button>

      {preview?.error && <ErrBox msg={preview.error} />}
      {preview && !preview.error && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">ファイル内: 講師 {preview.totalTeachers}名 / 生徒 {preview.totalStudents}名</p>
          {nothingNew ? (
            <p className="text-sm text-green-600 dark:text-green-400">未登録の情報はありませんでした。</p>
          ) : (
            <>
              <Chips title={`追加する講師（${preview.newTeachers.length}）`} color="purple" items={preview.newTeachers.map((t) => t.name)} />
              <Chips title={`追加する生徒（${preview.newStudents.length}）`} color="teal" items={preview.newStudents.map((s) => `${s.name}（${s.grade}）${s.isTrial ? ' [体験]' : ''}`)} />
              <Chips title={`ふりがな補完（${preview.furiganaUpdates.length}）`} color="amber" items={preview.furiganaUpdates.map((s) => `${s.name}→${s.furigana}`)} />
              <button onClick={() => run('commit')} disabled={pending}
                className="px-4 py-2 text-sm bg-navy text-white rounded-lg hover:bg-navy-light disabled:opacity-50 font-medium">
                {pending ? '登録中…' : 'この内容で登録する'}
              </button>
            </>
          )}
        </div>
      )}
      {result?.error && <ErrBox msg={result.error} />}
      {result && !result.error && (
        <OkBox msg={`講師 ${result.addedTeachers}名・生徒 ${result.addedStudents}名を追加、ふりがな ${result.updatedFurigana}名を補完しました。`} />
      )}
    </div>
  )
}

// ── 夏期講習コマインポート ──────────────────────────────
function ScheduleSection({ file, onDone }: { file: File | null; onDone: () => void }) {
  const [preview, setPreview] = useState<SchedulePreview | null>(null)
  const [result, setResult] = useState<ScheduleResult | null>(null)
  const [pending, startTransition] = useTransition()

  function run(fn: 'preview' | 'commit') {
    if (!file) return
    if (fn === 'commit' && !confirm('取り込み期間内の既存の講習コマを置き換えます。よろしいですか？')) return
    const fd = new FormData(); fd.set('file', file)
    setResult(null)
    startTransition(async () => {
      if (fn === 'preview') { setPreview(await previewSchedule(fd)) }
      else {
        const r = await commitSchedule(fd); setResult(r)
        if (!r.error) { setPreview(null); onDone() }
      }
    })
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">② 夏期講習コマ</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          「講習授業日程」から各日のコマ・担当講師・受講生徒・科目を取り込みます。ブースは割り当てず取り込むので、後で「自動ブース割り当て」を使ってください。
        </p>
      </div>
      <button onClick={() => run('preview')} disabled={!file || pending}
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {pending ? '処理中…' : '内容を確認する'}
      </button>

      {preview?.error && <ErrBox msg={preview.error} />}
      {preview && !preview.error && (
        <div className="space-y-3">
          <div className="text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-1">
            <p>期間: <span className="font-semibold">{preview.minDate} 〜 {preview.maxDate}</span></p>
            <p>コマ: <span className="font-semibold">{preview.lessonCount}</span>（集団 {preview.groupCount}・PS1 {preview.ps1Count}） / 受講登録: <span className="font-semibold">{preview.enrollmentCount}</span> 件</p>
          </div>
          {preview.unmatchedTeachers.length > 0 && (
            <Chips title={`⚠ 名簿に無い講師（${preview.unmatchedTeachers.length}）— 担当空欄で登録`} color="amber" items={preview.unmatchedTeachers} />
          )}
          {preview.unmatchedStudents.length > 0 && (
            <Chips title={`⚠ 名簿に無い生徒（${preview.unmatchedStudents.length}）— この生徒の受講はスキップ`} color="amber" items={preview.unmatchedStudents} />
          )}
          {(preview.unmatchedTeachers.length > 0 || preview.unmatchedStudents.length > 0) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">先に「①名簿」を取り込むと、未登録の講師・生徒が解消されます。</p>
          )}
          <button onClick={() => run('commit')} disabled={pending}
            className="px-4 py-2 text-sm bg-navy text-white rounded-lg hover:bg-navy-light disabled:opacity-50 font-medium">
            {pending ? '登録中…（数十秒かかる場合があります）' : 'この内容で登録する'}
          </button>
        </div>
      )}
      {result?.error && <ErrBox msg={result.error} />}
      {result && !result.error && (
        <>
          <OkBox msg={`コマ ${result.insertedLessons}件・受講 ${result.insertedEnrollments}件を登録（既存 ${result.deleted}件を置換、未登録生徒の受講 ${result.skippedEnrollments}件はスキップ、生徒の受講科目 ${result.updatedStudents}名を更新）。`} />
          {result.enrollWarning && <ErrBox msg={result.enrollWarning} />}
        </>
      )}
    </div>
  )
}

function ErrBox({ msg }: { msg: string }) {
  return <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm rounded-xl px-4 py-3">{msg}</div>
}
function OkBox({ msg }: { msg: string }) {
  return <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-300 text-sm rounded-xl px-4 py-3">{msg}</div>
}
function Chips({ title, items, color }: { title: string; items: string[]; color: 'purple' | 'teal' | 'amber' }) {
  const c = { purple: 'text-purple-700 dark:text-purple-300', teal: 'text-teal-700 dark:text-teal-300', amber: 'text-amber-700 dark:text-amber-300' }[color]
  return (
    <div>
      <p className={`text-sm font-semibold mb-1.5 ${c}`}>{title}</p>
      {items.length === 0 ? <p className="text-xs text-gray-400">なし</p> : (
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
          {items.map((it, i) => (
            <span key={i} className="text-xs bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-700 dark:text-gray-300">{it}</span>
          ))}
        </div>
      )}
    </div>
  )
}
