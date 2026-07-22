'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { previewImport, commitImport, type ImportPreview, type ImportResult } from './actions'

export function ImportClient() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [pending, startTransition] = useTransition()

  function handlePreview() {
    if (!file) return
    setResult(null); setPreview(null)
    const fd = new FormData(); fd.set('file', file)
    startTransition(async () => setPreview(await previewImport(fd)))
  }

  function handleCommit() {
    if (!file) return
    const fd = new FormData(); fd.set('file', file)
    startTransition(async () => {
      const r = await commitImport(fd)
      setResult(r)
      if (!r.error) { setPreview(null); router.refresh() }
    })
  }

  const nothingNew = preview && !preview.error &&
    preview.newTeachers.length === 0 && preview.newStudents.length === 0 && preview.furiganaUpdates.length === 0

  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5 space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          スケ組みソフトの Excel ファイル（.xlsm / .xlsx）を選ぶと、「講師名簿」「生徒名簿」を読み取り、
          <span className="font-semibold">まだ未登録の講師・生徒・ふりがな</span>だけを追加します。既存データは上書きしません。
        </p>
        <input
          type="file"
          accept=".xlsm,.xlsx,.xls"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null) }}
          className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-navy file:text-white hover:file:bg-navy-light"
        />
        <button
          onClick={handlePreview}
          disabled={!file || pending}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending ? '読み取り中…' : '内容を確認する'}
        </button>
      </div>

      {preview?.error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm rounded-xl px-4 py-3">
          {preview.error}
        </div>
      )}

      {preview && !preview.error && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ファイル内: 講師 {preview.totalTeachers}名 / 生徒 {preview.totalStudents}名
          </p>

          {nothingNew ? (
            <p className="text-sm text-green-600 dark:text-green-400">未登録の情報はありませんでした（すべて登録済み）。</p>
          ) : (
            <>
              <PreviewSection title={`新しく追加する講師（${preview.newTeachers.length}名）`} color="purple"
                items={preview.newTeachers.map((t) => t.name)} />
              <PreviewSection title={`新しく追加する生徒（${preview.newStudents.length}名）`} color="teal"
                items={preview.newStudents.map((s) => `${s.name}（${s.grade}）${s.furigana ? ' ' + s.furigana : ''}${s.isTrial ? ' [体験]' : ''}`)} />
              <PreviewSection title={`ふりがなを補完する既存生徒（${preview.furiganaUpdates.length}名）`} color="amber"
                items={preview.furiganaUpdates.map((s) => `${s.name} → ${s.furigana}`)} />

              <button
                onClick={handleCommit}
                disabled={pending}
                className="px-4 py-2 text-sm bg-navy text-white rounded-lg hover:bg-navy-light disabled:opacity-50 transition-colors font-medium"
              >
                {pending ? '登録中…' : 'この内容で登録する'}
              </button>
            </>
          )}
        </div>
      )}

      {result?.error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm rounded-xl px-4 py-3">
          {result.error}
        </div>
      )}
      {result && !result.error && (
        <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-300 text-sm rounded-xl px-4 py-3">
          登録が完了しました：講師 {result.addedTeachers}名・生徒 {result.addedStudents}名を追加、ふりがな {result.updatedFurigana}名を補完しました。
        </div>
      )}
    </div>
  )
}

function PreviewSection({ title, items, color }: { title: string; items: string[]; color: 'purple' | 'teal' | 'amber' }) {
  const colorClass = {
    purple: 'text-purple-700 dark:text-purple-300',
    teal: 'text-teal-700 dark:text-teal-300',
    amber: 'text-amber-700 dark:text-amber-300',
  }[color]
  return (
    <div>
      <p className={`text-sm font-semibold mb-1.5 ${colorClass}`}>{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">なし</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span key={i} className="text-xs bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-700 dark:text-gray-300">{it}</span>
          ))}
        </div>
      )}
    </div>
  )
}
