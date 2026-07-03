import type { Metadata, Viewport } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import './globals.css'
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration'

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto',
  display: 'swap',
})

export const metadata: Metadata = {
  title: '塾スケジュール管理システム',
  description: '学習塾向けスケジュール・シフト管理アプリケーション',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '塾システム',
  },
}

export const viewport: Viewport = {
  themeColor: '#1E3A5F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" className={`h-full ${notoSansJP.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="h-full">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  )
}
