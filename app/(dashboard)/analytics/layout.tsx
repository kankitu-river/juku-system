import Link from 'next/link'

const tabs = [
  { href: '/analytics/heatmap', label: '混雑ヒートマップ' },
  { href: '/analytics/booths', label: 'ブース稼働率' },
  { href: '/analytics/teachers', label: '講師継続率' },
  { href: '/analytics/monthly-report', label: '月次レポート' },
]

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-navy dark:hover:text-blue-300 border-b-2 border-transparent hover:border-navy dark:hover:border-blue-400 transition-colors -mb-px"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
