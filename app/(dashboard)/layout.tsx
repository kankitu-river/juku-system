import { TopNav } from '@/components/layout/TopNav'
import { ToastProvider } from '@/components/ui/Toast'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <ToastProvider>
        <main className="flex-1">
          <div className="p-6 max-w-7xl mx-auto">{children}</div>
        </main>
      </ToastProvider>
    </div>
  )
}
