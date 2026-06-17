'use client'

import { useState } from 'react'

const PAPER_SIZES = [
  { value: 'A3 landscape', label: 'A3 横' },
  { value: 'A4 landscape', label: 'A4 横' },
  { value: 'A3 portrait', label: 'A3 縦' },
  { value: 'A4 portrait', label: 'A4 縦' },
] as const

export function WeekPrintClient() {
  const [paperSize, setPaperSize] = useState<string>('A3 landscape')

  function handlePrint() {
    const style = document.createElement('style')
    style.id = '__print_page_size'
    style.textContent = `@page { size: ${paperSize}; margin: 10mm; }`
    document.head.appendChild(style)
    window.print()
    setTimeout(() => document.getElementById('__print_page_size')?.remove(), 500)
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={paperSize}
        onChange={(e) => setPaperSize(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] bg-white"
      >
        {PAPER_SIZES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <button
        onClick={handlePrint}
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white text-sm font-medium rounded-lg hover:bg-[#2d5487] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        印刷
      </button>
    </div>
  )
}
