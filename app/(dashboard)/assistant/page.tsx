import { Header } from '@/components/layout/Header'
import { AssistantChat } from './AssistantChat'

export default function AssistantPage() {
  return (
    <div>
      <Header
        title="アシスタント"
        subtitle="登録データについて質問できます（LLM不使用）"
      />
      <AssistantChat />
    </div>
  )
}
