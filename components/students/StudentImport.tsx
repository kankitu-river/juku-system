'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Teacher } from '@/types'
import { importStudentsWithLessons, type LessonImportRow } from '@/app/(dashboard)/students/actions'

const DAY_MAP: Record<string, number> = {
  月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
}
const SAMPLE_CSV = `氏名,学年,受講科目,曜日,コマ,担当講師
田中太郎,高3,数学,火,2,山田
田中太郎,高3,英語,木,1,鈴木
青塚花子,中2,国語,月,1,田中
佐藤次郎,中1,数学,水,2,`

interface PreviewRow {
  name: string
  grade: string
  subject: string
  day: string
  slot: string
  teacherName: string
  teacherId: string
  warn?: string
}

interface Props {
  teachers: Teacher[]
}

export function StudentImport({ teachers }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [error, setError] = useState<string>()
  const [importResult, setImportResult] = useState<{ studentCount?: number; lessonCount?: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  function downloadSample() {
    const blob = new Blob(['﻿' + SAMPLE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '生徒インポートサンプル.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(undefined)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = (ev.target?.result as string).replace(/^﻿/, '')
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) { setError('データが見つかりません。'); return }

      const headers = lines[0].split(',').map(h => h.trim())
      const idxOf = (name: string) => headers.indexOf(name)
      const iName = idxOf('氏名'), iGrade = idxOf('学年')
      const iSubject = idxOf('受講科目'), iDay = idxOf('曜日')
      const iSlot = idxOf('コマ'), iTeacher = idxOf('担当講師')

      if (iName < 0 || iGrade < 0) { setError('「氏名」「学年」列が必要です。'); return }

      const rows: PreviewRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim())
        const name = cols[iName] ?? ''
        const grade = cols[iGrade] ?? ''
        if (!name || !grade) continue
        const subject = iSubject >= 0 ? (cols[iSubject] ?? '') : ''
        const day = iDay >= 0 ? (cols[iDay] ?? '') : ''
        const slot = iSlot >= 0 ? (cols[iSlot] ?? '') : ''
        const teacherName = iTeacher >= 0 ? (cols[iTeacher] ?? '') : ''
        const teacher = teachers.find(t => t.name.includes(teacherName) || teacherName.includes(t.name.replace(/\s/g, '')))
        const teacherId = teacher?.id ?? ''
        const warn = teacherName && !teacher ? `「${teacherName}」は未登録の先生名です` : undefined
        rows.push({ name, grade, subject, day, slot, teacherName, teacherId, warn })
      }
      setPreview(rows)
    }
    reader.readAsText(file, 'UTF-8')
  }

  function buildRows(): LessonImportRow[] {
    if (!preview) return []
    return preview.map(row => ({
      name: row.name,
      grade: row.grade,
      subject: row.subject,
      dayNum: DAY_MAP[row.day] ?? 0,
      slotNum: parseInt(row.slot) || 0,
      teacherId: row.teacherId,
    }))
  }

  function handleImport() {
    const rows = buildRows()
    if (!rows.length) return
    setError(undefined)
    startTransition(async () => {
      const result = await importStudentsWithLessons(rows)
      if (result.error) {
        setError(result.error)
      } else {
        setImportResult(result)
        setPreview(null)
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      }
    })
  }

  const studentCount = preview ? new Set(preview.map(r => `${r.name}__${r.grade}`)).size : 0
  const lessonRowCount = preview?.filter(r => r.day && r.slot).length ?? 0
  const warnCount = preview?.filter(r => r.warn).length ?? 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={downloadSample}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          サンプルCSVをダウンロード
        </button>
        <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-navy dark:text-blue-300 border border-navy rounded-lg hover:bg-blue-50 transition-colors cursor-pointer">
          CSVを選択してインポート
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFile}
          />
        </label>
      </div>

      {importResult && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 px-4 py-3 text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0 text-green-600 dark:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {importResult.studentCount}名の生徒を登録しました
          {(importResult.lessonCount ?? 0) > 0 && `・${importResult.lessonCount}コマを新規作成しました`}
          <button onClick={() => setImportResult(null)} className="ml-auto text-green-600 dark:text-green-300 hover:text-green-800 text-xs">閉じる</button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {preview && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              プレビュー：{studentCount}名・{preview.length}行
              {lessonRowCount > 0 && (
                <span className="ml-2 text-teal-600 dark:text-teal-300 text-xs">コマ情報あり</span>
              )}
              {warnCount > 0 && (
                <span className="ml-2 text-amber-600 dark:text-amber-300 text-xs">⚠ {warnCount}件の警告</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isPending}
                className="px-4 py-1.5 text-xs font-medium bg-navy text-white rounded-lg hover:bg-navy-dark disabled:opacity-50 transition-colors"
              >
                {isPending ? '登録中...' : lessonRowCount > 0 ? `${studentCount}名を登録＋コマ作成` : `${studentCount}名を一括登録`}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  {['氏名', '学年', '受講科目', '曜日', 'コマ', '担当講師'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {preview.map((row, i) => (
                  <tr key={i} className={row.warn ? 'bg-amber-50 dark:bg-amber-950/40' : ''}>
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{row.name}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.grade}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.subject}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.day}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.slot}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                      {row.teacherName}
                      {row.warn && <span className="ml-1 text-amber-600 dark:text-amber-300">⚠</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
