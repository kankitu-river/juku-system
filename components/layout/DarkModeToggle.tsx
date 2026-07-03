'use client'

import { useEffect, useState } from 'react'

export function DarkModeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('darkMode')
    const isDark = saved === 'true'
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    localStorage.setItem('darkMode', String(next))
    document.documentElement.classList.toggle('dark', next)
  }

  const icon = dark ? (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )

  if (compact) {
    return (
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        title={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
        aria-label={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
      >
        {icon}
        <span className="hidden xl:inline">{dark ? 'ライト' : 'ダーク'}</span>
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
      title={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
    >
      {icon}
      {dark ? 'ライトモード' : 'ダークモード'}
    </button>
  )
}
