import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-navy dark:text-blue-300 mb-4">404</p>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">ページが見つかりません</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          URLが間違っているか、ページが移動・削除された可能性があります。
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-dark transition-colors"
        >
          ダッシュボードに戻る
        </Link>
      </div>
    </div>
  )
}
