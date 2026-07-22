import { Header } from '@/components/layout/Header'
import { ImportClient } from './ImportClient'
import Link from 'next/link'

// 大きなExcelの解析・一括登録に時間がかかるため上限を延長
export const maxDuration = 60

export default function ImportPage() {
  return (
    <div>
      <Header
        title="Excelから取り込み"
        subtitle="スケ組みソフトのExcelから、講師・生徒・夏期講習コマを取り込みます"
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
