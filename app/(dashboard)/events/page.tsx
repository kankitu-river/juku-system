import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

export default async function EventsPage() {
  const supabase = await createClient()
  const { data: events } = await supabase
    .from('events')
    .select('*, teacher:teachers(id, name)')
    .order('start_at', { ascending: false })

  return (
    <div>
      <Header
        title="イベント・講習会"
        subtitle="特別イベントや講習会の管理"
        actions={
          <Link href="/events/new">
            <Button>+ イベントを追加</Button>
          </Link>
        }
      />

      {events && events.length > 0 ? (
        <div className="space-y-3">
          {events.map((event) => {
            const start = new Date(event.start_at)
            const end = new Date(event.end_at)
            const isPast = end < new Date()
            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className={[
                  'flex items-start gap-4 bg-white rounded-xl border shadow-sm px-5 py-4 hover:shadow-md transition-shadow',
                  isPast ? 'border-gray-100 opacity-60' : 'border-amber-100',
                ].join(' ')}
              >
                {/* 日付ブロック */}
                <div className={[
                  'flex-shrink-0 text-center rounded-xl px-3 py-2 min-w-[56px]',
                  isPast ? 'bg-gray-100' : 'bg-amber-50',
                ].join(' ')}>
                  <p className="text-xs text-gray-500">{start.getMonth() + 1}月</p>
                  <p className="text-2xl font-bold text-gray-800 leading-none">{start.getDate()}</p>
                  <p className="text-xs text-gray-400">
                    {['日', '月', '火', '水', '木', '金', '土'][start.getDay()]}
                  </p>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{event.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    {' 〜 '}
                    {end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    {event.teacher?.name && <span className="ml-2">· {event.teacher.name}</span>}
                  </p>
                  {event.description && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{event.description}</p>
                  )}
                </div>

                {isPast && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">終了済み</span>
                )}
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-400 text-sm mb-4">イベントはまだありません</p>
          <Link href="/events/new"><Button>最初のイベントを登録する</Button></Link>
        </div>
      )}
    </div>
  )
}
