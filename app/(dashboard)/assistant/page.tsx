import { Header } from '@/components/layout/Header'
import { AssistantChat } from './AssistantChat'

export default function AssistantPage() {
  return (
    <div className="flex flex-col h-screen">
      <Header
        title="AIアシスタント"
        subtitle="データについて自然言語で質問できます"
      />
      <div className="flex-1 overflow-hidden px-4 md:px-6">
        <AssistantChat />
      </div>
    </div>
  )
}
