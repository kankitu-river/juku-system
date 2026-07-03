'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importTeachers, type TeacherImportRow } from '@/app/(dashboard)/teachers/actions'
import type { SubjectGrade } from '@/types'

const GRADE_OPTIONS = ['小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3']

const SAMPLE_CSV = `氏名,メールアドレス,権限,科目,担当学年
山田太郎,yamada@juku.com,staff,数学,中1/中2/中3/高1/高2/高3
山田太郎,,staff,物理,高1/高2/高3
鈴木花子,,staff,英語,小6/中1/中2/中3
田中一郎,tanaka@juku.com,admin,国語,中1/中2/中3`

interface PreviewRow {
  name: string
  email: string
  role: string
  subject: string
  grades: string
  warn?: string
}

export function TeacherImport() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  function downloadSample() {
    const blob = new Blob(['﻿' + SAMPLE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '先生インポートサンプル.csv'
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
      const iName = idxOf('氏名')
      const iEmail = idxOf('メールアドレス')
      const iRole = idxOf('権限')
      const iSubject = idxOf('科目')
      const iGrades = idxOf('担当学年')

      if (iName < 0) { setError('「氏名」列が必要です。'); return }

      const rows: PreviewRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim())
        const name = cols[iName] ?? ''
        if (!name) continue
        const email = iEmail >= 0 ? (cols[iEmail] ?? '') : ''
        const role = iRole >= 0 ? (cols[iRole] ?? 'staff') : 'staff'
        const subject = iSubject >= 0 ? (cols[iSubject] ?? '') : ''
        const grades = iGrades >= 0 ? (cols[iGrades] ?? '') : ''

        const roleVal = role === 'admin' ? 'admin' : 'staff'
        const warn = role && role !== 'admin' && role !== 'staff'
          ? `権限「${role}」は不明です（staff として登録）`
          : undefined

        rows.push({ name, email, role: roleVal, subject, grades, warn })
      }
      setPreview(rows)
    }
    reader.readAsText(file, 'UTF-8')
  }

  function buildTeachers(): TeacherImportRow[] {
    if (!preview) return []
    const map = new Map<string, TeacherImportRow>()
    for (const row of preview) {
      if (!map.has(row.name)) {
        map.set(row.name, {
          name: row.name,
          email: row.email.trim() || null,
          role: row.role as 'admin' | 'staff',
          subject_grades: [],
          subjects: [],
          grade_levels: [],
        })
      }
      const teacher = map.get(row.name)!
      if (row.subject) {
        const gradeList = row.grades
          .split('/')
          .map(g => g.trim())
          .filter(g => GRADE_OPTIONS.includes(g))
        const exists = teacher.subject_grades.find(sg => sg.subject === row.subject)
        if (!exists) {
          teacher.subject_grades.push({ subject: row.subject, grades: gradeList })
          if (!teacher.subjects.includes(row.subject)) teacher.subjects.push(row.subject)
          for (const g of gradeList) {
            if (!teacher.grade_levels.includes(g)) teacher.grade_levels.push(g)
          }
        }
      }
    }
    return Array.from(map.values())
  }

  function handleImport() {
    const teachers = buildTeachers()
    if (!teachers.length) return
    setError(undefined)
    startTransition(async () => {
      const result = await importTeachers(teachers)
      if (result.error) {
        setError(result.error)
      } else {
        setPreview(null)
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      }
    })
  }

  const teacherCount = preview ? new Set(preview.map(r => r.name)).size : 0
  const warnCount = preview?.filter(r => r.warn).length ?? 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
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

      <p className="text-xs text-gray-400">
        列：氏名・メールアドレス（任意）・権限（admin/staff）・科目・担当学年（中1/中2/高1 のようにスラッシュ区切り）。1行1科目、同じ名前の行は1人にまとめます。
      </p>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {preview && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              プレビュー：{teacherCount}名・{preview.length}行
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
                {isPending ? '登録中...' : `${teacherCount}名を一括登録`}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  {['氏名', 'メール', '権限', '科目', '担当学年'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {preview.map((row, i) => (
                  <tr key={i} className={row.warn ? 'bg-amber-50 dark:bg-amber-950/40' : ''}>
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{row.name}</td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{row.email || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.role}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.subject || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                      {row.grades || '—'}
                      {row.warn && <span className="ml-1 text-amber-600 dark:text-amber-300" title={row.warn}>⚠</span>}
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
