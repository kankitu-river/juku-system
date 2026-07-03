'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DarkModeToggle } from './DarkModeToggle'

interface NavLink {
  href: string
  label: string
  icon: React.ReactNode
  activeMatch?: (pathname: string) => boolean
}

interface NavGroup {
  label: string
  icon?: React.ReactNode
  children: NavLink[]
}

type NavEntry = NavLink | NavGroup

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

const icons = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  schedule: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  intensive: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  pdf: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  attendance: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  makeup: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  shifts: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  teachers: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  students: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  booths: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  ),
  events: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  logout: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
}

const navigation: NavEntry[] = [
  { href: '/', label: 'ダッシュボード', icon: icons.dashboard },
  {
    label: 'スケジュール',
    children: [
      {
        href: '/schedule', label: '週間スケジュール', icon: icons.schedule,
        activeMatch: (p) => p.startsWith('/schedule') && !p.startsWith('/schedule/intensive'),
      },
      { href: '/schedule/intensive', label: '講習割り振り', icon: icons.intensive },
      { href: '/print/monthly', label: 'PDF出力', icon: icons.pdf },
    ],
  },
  {
    label: '出欠・振替',
    children: [
      {
        href: '/attendance', label: '出欠管理', icon: icons.attendance,
        activeMatch: (p) => p.startsWith('/attendance') && !p.startsWith('/attendance/makeup'),
      },
      { href: '/attendance/makeup', label: '振替管理', icon: icons.makeup },
    ],
  },
  { href: '/shifts', label: 'シフト管理', icon: icons.shifts },
  {
    label: '名簿',
    children: [
      { href: '/teachers', label: '先生管理', icon: icons.teachers },
      { href: '/students', label: '生徒管理', icon: icons.students },
      { href: '/booths', label: 'ブース管理', icon: icons.booths },
    ],
  },
  { href: '/events', label: 'イベント', icon: icons.events },
]

function isLinkActive(link: NavLink, pathname: string): boolean {
  if (link.activeMatch) return link.activeMatch(pathname)
  if (link.href === '/') return pathname === '/'
  return pathname.startsWith(link.href)
}

function isEntryActive(entry: NavEntry, pathname: string): boolean {
  if (isGroup(entry)) return entry.children.some((c) => isLinkActive(c, pathname))
  return isLinkActive(entry, pathname)
}

function SearchForm({ compact }: { compact?: boolean }) {
  return (
    <form method="GET" action="/search" className={compact ? '' : 'px-3 pt-3'}>
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          name="q"
          placeholder="検索..."
          className={[
            'bg-white/10 text-white placeholder-white/40 text-sm rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:bg-white/20 transition-all',
            compact ? 'w-36 focus:w-48' : 'w-full',
          ].join(' ')}
        />
      </div>
    </form>
  )
}

export function TopNav() {
  const pathname = usePathname()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  // ページ遷移で全メニューを閉じる
  useEffect(() => {
    setOpenMenu(null)
    setMobileOpen(false)
  }, [pathname])

  // Escape キーで閉じる
  useEffect(() => {
    if (!openMenu && !mobileOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenMenu(null)
        setMobileOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [openMenu, mobileOpen])

  const settingsActive = pathname.startsWith('/settings')

  return (
    <header className="sticky top-0 z-40 bg-navy text-white shadow-md print:hidden relative">
      {/* ドロップダウン用の外側クリック閉じオーバーレイ */}
      {openMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
      )}

      <div className="flex items-center h-14 px-4 gap-2">
        {/* ブランド */}
        <Link href="/" className="text-base font-bold whitespace-nowrap">
          塾スケジュール<span className="hidden xl:inline">管理システム</span>
        </Link>

        {/* デスクトップ: 中央ナビ */}
        <nav className="hidden lg:flex items-center gap-1 flex-1 ml-6">
          {navigation.map((entry) => {
            const active = isEntryActive(entry, pathname)
            const baseClass = [
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              active ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
            ].join(' ')

            if (!isGroup(entry)) {
              return (
                <Link key={entry.label} href={entry.href} className={baseClass}>
                  {entry.label}
                </Link>
              )
            }

            const isOpen = openMenu === entry.label
            return (
              <div key={entry.label} className="relative">
                <button
                  onClick={() => setOpenMenu(isOpen ? null : entry.label)}
                  className={`${baseClass} flex items-center gap-1 relative z-50`}
                  aria-expanded={isOpen}
                >
                  {entry.label}
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="absolute top-full left-0 mt-1 min-w-[180px] bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
                    {entry.children.map((child) => {
                      const childActive = isLinkActive(child, pathname)
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setOpenMenu(null)}
                          className={[
                            'block px-4 py-2.5 text-sm',
                            childActive
                              ? 'text-navy font-semibold bg-gray-50'
                              : 'text-gray-700 hover:bg-gray-50',
                          ].join(' ')}
                        >
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* デスクトップ: 右クラスタ */}
        <div className="hidden lg:flex items-center gap-1 ml-auto">
          <SearchForm compact />
          <DarkModeToggle compact />
          <Link
            href="/settings"
            title="設定"
            aria-label="設定"
            className={[
              'p-2 rounded-lg transition-colors',
              settingsActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
            ].join(' ')}
          >
            {icons.settings}
          </Link>
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              title="ログアウト"
              aria-label="ログアウト"
              className="p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              {icons.logout}
            </button>
          </form>
        </div>

        {/* モバイル: ハンバーガー */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden ml-auto p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          aria-label={mobileOpen ? 'メニューを閉じる' : 'メニューを開く'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* モバイル: 展開パネル */}
      {mobileOpen && (
        <div className="lg:hidden absolute top-full left-0 right-0 bg-navy border-t border-white/10 shadow-lg max-h-[calc(100vh-3.5rem)] overflow-y-auto z-50">
          <SearchForm />
          <nav className="px-3 py-3 space-y-1">
            {navigation.map((entry) => {
              if (!isGroup(entry)) {
                const active = isLinkActive(entry, pathname)
                return (
                  <Link
                    key={entry.label}
                    href={entry.href}
                    onClick={() => setMobileOpen(false)}
                    className={[
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      active ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
                    ].join(' ')}
                  >
                    {entry.icon}
                    {entry.label}
                  </Link>
                )
              }
              return (
                <div key={entry.label}>
                  <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-white/40">
                    {entry.label}
                  </div>
                  {entry.children.map((child) => {
                    const active = isLinkActive(child, pathname)
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setMobileOpen(false)}
                        className={[
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                          active ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
                        ].join(' ')}
                      >
                        {child.icon}
                        {child.label}
                      </Link>
                    )
                  })}
                </div>
              )
            })}
            <Link
              href="/settings"
              onClick={() => setMobileOpen(false)}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                settingsActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
              ].join(' ')}
            >
              {icons.settings}
              設定
            </Link>
          </nav>
          <div className="px-3 py-3 border-t border-white/10 space-y-1">
            <DarkModeToggle />
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              >
                {icons.logout}
                ログアウト
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  )
}
