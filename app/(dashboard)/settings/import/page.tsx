import { Header } from '@/components/layout/Header'
import { ImportClient } from './ImportClient'
import Link from 'next/link'

export default function ImportPage() {
  return (
    <div>
      <Header
        title="名簿インポート"
        subtitle="スケ組みソフトのExcelから講師・生徒を取り込みます"
        actions={
          <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            ← 設定へ
          </Link>
        }
      />
      <ImportClient />
    </div>
  )
}
