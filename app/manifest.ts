import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '塾スケジュール管理システム',
    short_name: '塾システム',
    description: '学習塾向けスケジュール・シフト管理',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1E3A5F',
    theme_color: '#1E3A5F',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
