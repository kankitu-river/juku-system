import { Header } from '@/components/layout/Header'

export default function AssistantPage() {
  return (
    <div>
      <Header
        title="AIアシスタント"
        subtitle="現在この機能は無効です"
      />
      <div className="max-w-lg">
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            AIチャット機能は現在無効です。
          </p>
        </div>
      </div>
    </div>
  )
}
